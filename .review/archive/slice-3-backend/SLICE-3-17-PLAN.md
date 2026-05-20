# Slice 3 #17 — Plan

## Goal

`PATCH /vocs/:id/description` — Reporter-only, pre-triage-only edit of `title` / `description_rich_content` / `attachments`. Closes Slice 3 BE exit criterion (`docs/implementation/08-mvp-slice-plan.md:100`).

After this issue lands, Slice 3 BE is **fully closed**; next stop is #18 (FE prologue).

## Reused patterns

- Route shape: mirrors `PATCH /vocs/:id` (#14) — `Idempotency-Key` + `If-Match` headers, hash includes `ifMatch`, advisory_xact_lock + idempotency lookup.
- Service-layer ordering: `selectForUpdate(voc) → permission check → state check → If-Match → parent MS lock → sanitize → diff → UPDATE → audit → refresh envelope` (mirrors #14).
- Sanitizer: reuses post-#23/#24 `sanitizeTipTap({ surface: 'voc-description' })`.
- Forbidden-fields guard: mirrors `FORBIDDEN_PATCH_FIELDS` in shared, but **opposite set** (allowlist is `title|description_rich_content|attachments`; everything else is forbidden).
- Audit envelope: mirrors `analytics_area_updated` `changes: Record<field, {from, to}>` pattern from Slice 2 #11.

## Codex plan review — disposition (rev 2)

| Sev | Finding | Disposition |
|---|---|---|
| BLOCKER | Use `.strict()` on zod schema; allowlist is the security boundary | **Accepted.** Schema is `.strict()` + non-empty refinement. Forbidden-field precheck retained only for precise `validation.unexpected_field` UX on known-named server fields. Strict mode catches everything else as zod `unrecognized_keys`. |
| MAJOR | Per-key audit shape > `Record<field, union>` | **Accepted.** Audit `changes` is an object `{ title?: stringChange, description_rich_content?: richHashChange, attachments?: attachmentDelta }` with `.refine(o => Object.keys(o).length > 0)`. Each field's value type matches its semantics; impossible to pair `title` with `rich_hash`. |
| MAJOR | Stable-stringify for description hash | **Accepted.** Hash via recursive sorted-key serializer (`stableStringify`), not `JSON.stringify`. Both `from` (DB) and `to` (sanitized) pass through it. Test: shuffled attr key order → same hash. |
| MAJOR | Empty-diff: no UPDATE, no updated_at bump, no audit | **Accepted.** Doc explicitly in service comment + tests. Idempotency still records the 200 envelope so replay returns cached. |
| MAJOR | Forbidden list incomplete as boundary | **Accepted.** `.strict()` is the boundary. Forbidden list is UX-only: surfaces named common fields (`severity`, `owner_*`, etc.) with `validation.unexpected_field`. Unknown fields not on the named list still rejected by `.strict()` as `validation.failed` with `fields[]` from zod issues. Test: include `__proto__` / `id` / `created_at` / made-up field → all rejected. |
| MINOR | permission → state → If-Match ordering | Locked. |
| MINOR | Add test: reporter + stale If-Match + triaged row → `conflict.triage_already_committed` (state check fires first) | Added to test enum (case 26). |

## New surface (this PR only)

1. **Wire schema** `packages/shared/src/vocs/edit-description-request.ts`:
   ```ts
   export const editDescriptionRequestSchema = z.object({
     title: z.string().min(1).max(200).optional(),
     description_rich_content: tipTapDocSchema.optional(),
     attachments: z.array(attachmentRefSchema).optional(),
   })
     .strict()
     .refine(o => Object.keys(o).length > 0, { message: 'at least one field required' });

   // UX-only: known server-managed fields get a precise per-field error code.
   // .strict() catches anything else as a generic validation.failed.
   export const FORBIDDEN_EDIT_DESCRIPTION_FIELDS = [
     'severity','owner_user_id','owner_team_id','analytics_area_id',
     'triage_state','cluster_decision','reporter_facing_status','source_context',
     'primary_managed_system_id','reporter_id','archived_at','workspace_id',
     'display_id','id','created_at','updated_at',
   ] as const;
   export const FORBIDDEN_EDIT_DESCRIPTION_FIELD_ERROR_CODES: Record<Forbidden, 'validation.unexpected_field'> = ... ;
   ```

2. **New ADR-0012 error code** `conflict.triage_already_committed` (HTTP 409). Body shape: `{ code, message, detail: { current_triage_state: TriageState } }`. Add to `packages/shared/src/errors/codes.ts` + amend `docs/adr/0012-error-code-contract.md`.

3. **New audit event** `voc_description_edited`. Add to `packages/shared/src/audit/voc.ts`:
   ```ts
   const stringChange = z.object({ from: z.string(), to: z.string() });
   const richHashChange = z.object({ from_hash: z.string().length(64), to_hash: z.string().length(64) });
   const attachmentsDelta = z.object({
     from: z.array(attachmentRefSchema),
     to: z.array(attachmentRefSchema),
   });

   voc_description_edited: z.object({
     changes: z.object({
       title: stringChange.optional(),
       description_rich_content: richHashChange.optional(),
       attachments: attachmentsDelta.optional(),
     }).refine(o => Object.keys(o).length > 0, { message: 'changes must be non-empty' }),
   })
   ```
   Cross-field invariants (e.g. `attachments` from === to is OK and won't ship until storage slice) live in the service layer assertion, not the schema, to keep schema additive across slices.

4. **Stable-stringify helper** for description hash — add `apps/backend/src/lib/json/stable-stringify.ts`:
   ```ts
   // Recursive object key sort for deterministic SHA-256 input.
   // Arrays preserve order (TipTap doc semantics depend on it).
   export function stableStringify(v: unknown): string { ... }
   ```
   Unit test with shuffled attr key order returning same string.

4. **New service function** `editVocDescription` in `apps/backend/src/modules/voc/service.ts`. Same `Tx`/`actor`/`vocId`/`ifMatch`/`input` signature shape as `updateVoc` (#14). Returns `VocDetailEnvelope`.

5. **New repo helper** `updateVocDescriptionFields` in `apps/backend/src/modules/voc/repo.ts` — UPDATE row with provided fields only (mirrors #14's `updateVocTriageFields`). Locks workspace in UPDATE filter (defense-in-depth, per #16 cycle-2 B2 fix).

6. **New route** `PATCH /vocs/:id/description` in routes.ts. New rate-limit bucket: 30/min per actor (per issue body). Mirror existing `rateLimitConfig` extension or inline override.

## Sanitizer hash for audit diff

`description_rich_content` changes audit `{from_hash, to_hash}`. Hash: SHA-256 hex of `JSON.stringify` of the **sanitized canonical doc** (post-#23 rebuild). Both `from` (current persisted) and `to` (sanitized input) hashed identically.

Rationale: full TipTap doc in audit row is bloat; hash is enough to correlate edit events to forensic queries against the row history. If forensic queries need full content, the row's `description_rich_content` column carries the latest; previous-version retrieval would be a separate audit-with-snapshot concern (out of scope).

## Permission semantics — critical departures from #14

- `actor.actor_id === voc.reporter_id` — **exclusive**. Admin/Dev/anyone-else → `permission.denied`. No capability check, no workspace-admin escape hatch. This is the ONE endpoint where Admin has no elevated path.
- Triage-state gate: `voc.triage_state === 'untriaged'`. Any other state → `conflict.triage_already_committed` (new code). Race window: Reporter's tx must `SELECT FOR UPDATE` before reading triage_state, so a concurrent triage commit either lands first (Reporter sees committed) or queues behind Reporter (Reporter wins, Admin's later `SELECT FOR UPDATE` sees `updated_at` changed → stale_write).

## Empty-diff handling

Spec convention (Slice 2 #11): empty diff → `200 OK`, no audit row, return current envelope. Sanitizer normalizes `description_rich_content` first (canonical rebuild), so two semantically-equal docs with different JSON formatting still compare equal at the hash level. `title` and `attachments` compared by `===` (string) / `JSON.stringify` (array of `{id}`).

If sanitizer rejects → 422 fires before diff check; never reaches audit.

## Files touched

- `packages/shared/src/vocs/edit-description-request.ts` (new) — wire schema + forbidden-fields constant.
- `packages/shared/src/vocs/index.ts` — export new symbols.
- `packages/shared/src/vocs/__tests__/edit-description-request.test.ts` (new).
- `packages/shared/src/errors/codes.ts` — add `conflict.triage_already_committed`.
- `packages/shared/src/errors/__tests__/codes.test.ts` — regression for new code.
- `docs/adr/0012-error-code-contract.md` — amend enum.
- `packages/shared/src/audit/voc.ts` — add `voc_description_edited` event schema.
- `packages/shared/src/audit/__tests__/voc-audit-schemas.test.ts` — assert new event accepts/rejects.
- `packages/shared/src/enums/audit-events.ts` — add `voc_description_edited` to the closed enum (if such enum exists; otherwise N/A).
- `apps/backend/src/modules/voc/service.ts` — `editVocDescription`.
- `apps/backend/src/modules/voc/repo.ts` — `updateVocDescriptionFields`.
- `apps/backend/src/modules/voc/routes.ts` — new route handler.
- `apps/backend/src/modules/voc/__tests__/patch-description.integration.test.ts` (new) — covers all 16 acceptance criteria.

Out of scope:
- Attachment upload (#22).
- Other Reporter edits (severity, owner, AA, source_context) — issue explicitly says no.

## Tests — explicit enumeration (integration; real Postgres)

Building on #14's race/idempotency/rate-limit harness:

**Happy paths**
1. Reporter edits own untriaged VOC with all 3 fields → 200; envelope refreshed; one `voc_description_edited` audit row with full diff.
2. Title-only edit → 200; audit `changes` carries only `title`.
3. Description-only edit → 200; audit carries `description_rich_content` with `{from_hash, to_hash}`.
4. Empty `attachments: []` when current is also `[]` → no diff for attachments field; if other fields also unchanged → 200 + no audit row.

**Permission**
5. Other Reporter on someone else's VOC → 403 permission.denied.
6. Workspace Admin on someone else's VOC → 403 permission.denied (no admin elevation).
7. Same-MS Developer with voc.triage capability → 403 permission.denied (capability irrelevant here).

**State**
8. Triaged VOC (`triage_state='active'`) → 409 conflict.triage_already_committed with `detail.current_triage_state='active'`.
9. Archived VOC → 409 conflict.record_archived.
10. Archived parent MS → 409 conflict.parent_archived.

**Validation**
11. Empty body → 422 validation.failed.
12. Forbidden field (`severity`) → 422 validation.unexpected_field with `fields[0].path=['severity']`.
13. Multiple forbidden → fields[] carries each.
14. Bad title (e.g. 201 chars) → 422 validation.failed.
15. Non-empty `attachments: [{id: <uuid>}]` → 422 attachment.unsupported_pending_storage_slice.

**Sanitizer rejection paths (regression — confirm wire path)**
16. `description_rich_content` with image node → 422 rich_content.external_image_forbidden.
17. `description_rich_content` with `link.href='javascript:…'` → 422 rich_content.disallowed_node + fields_code='invalid_attr_value' (post-#23).

**Headers**
18. Missing `If-Match` → 400 validation.failed (header missing).
19. `If-Match` mismatch → 409 conflict.stale_write with `detail.current_updated_at`.

**Concurrency**
20. Reporter starts edit; Admin commits triage (#14) in another tx that lands first → Reporter's later edit returns 409 conflict.triage_already_committed (state changed).
21. Reporter and Admin race tightly with same starting `updated_at` → exactly one wins, other returns 409 conflict.stale_write (or triage_already_committed depending on order).

**Idempotency**
22. Same Idempotency-Key + body + If-Match replay → cached 200.
23. Same Idempotency-Key, different body → 409 conflict.idempotency_key_reuse.
24. Same Idempotency-Key + body, refreshed If-Match (different value) → 409 conflict.idempotency_key_reuse (per #14 hash-includes-If-Match decision; reused unchanged).

**Rate limit**
25. 31st PATCH within 60s from same actor → 429 rate_limited.actor. (Confirm bucket separation from generic mutation bucket if applicable.)

**Strict-schema / forbidden-field boundary (cycle-1 BLOCKER + MAJOR)**
26. Reporter + stale If-Match + already-triaged VOC → 409 `conflict.triage_already_committed` (state check fires before If-Match per plan ordering).
27. Body with unknown fields not on the FORBIDDEN list (e.g. `__proto__`, `foobar`, `created_at`) → 422 validation.failed with zod `unrecognized_keys`.
28. Body with shuffled-attr-key `description_rich_content` semantically equal to current → empty diff → 200 no audit (stable-stringify regression).

## Risks

1. **Audit event closed-enum.** If `audit_events` is a closed Zod enum, adding `voc_description_edited` is an additive change but requires touching all consumer paths that decode by `type`. Quick scan during impl will catch.
2. **`conflict.triage_already_committed` enum extension** — adds to ADR-0012 closed enum. Coordinated with FE error-code handling; FE will see new code post-#18 but it can fall back to "unknown 409" gracefully. Document in PR body.
3. **Idempotency-hash-with-If-Match** carries the same caveat as #14: client must use fresh Idempotency-Key after a 409 stale_write refetch. Documented in #14; restate here for Reporter UX.
4. **`description_rich_content` hash** — SHA-256 of `JSON.stringify(canonical)`. Property iteration order is JS-engine deterministic in V8 (insertion order for non-integer keys); sanitizer's canonical rebuild ensures insertion order is stable. Safe.

## Chunks

- **C1 (Sonnet):** shared package — wire schema, forbidden-fields, codes, audit-event, ADR-0012 amend. Tests.
- **C2 (Sonnet):** backend — repo helper, service, route. Reuse #14 helpers (`requireIdempotencyKey`, `requireIfMatch`, `hashRequestBody`).
- **C3 (Sonnet):** integration tests — all 25 cases above.
- **C4 (Opus orchestrator):** codex CLI cycle-1.
- **C5 (Opus subagent):** cycle-2.
- **C6:** ship + wiki sync (`voc-lifecycle.md` add pre-triage Reporter edit row to lifecycle table; `bounded-context-voc.md` mention the new endpoint).

## Exit criteria

- 25 new integration tests; full backend suite green (~544 total).
- 2-cycle review clean.
- PR merged, #17 closed.
- ADR-0012 amended in this PR.
- Memory `project_slice3_17_pr` + wiki synced.
- **Slice 3 BE exit criterion fully closed.**
