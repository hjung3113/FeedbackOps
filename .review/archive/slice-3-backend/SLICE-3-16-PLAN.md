# Slice 3 #16 — Plan

**Issue:** POST /vocs/:id/{public-updates, reporter-replies, internal-comments} + sanitizer surface tightening + ADR-0012 enum addition (`reporter_facing_status.gate_blocked`, `reporter_facing_status.invalid_transition`).

**Branch:** `feature/16-voc-conversation-posts` from `develop`.

**Spec authority:** `docs/frontend/specs/voc.md` §8.5 / §8.6 / §8.7; issue #16 body (AC locked).

**Review protocol:** 2 cycles — codex CLI (cycle 1) then Opus subagent (cycle 2). Sonnet implements; main = orchestrator.

---

## Key context discovered from codebase

1. **Migration 0010** ships `voc_public_updates.body_rich_content jsonb NOT NULL`. Issue says skip-path row carries NULL body. **Migration 0012 required** to relax that column to NULL. Skip-path row INSERTs body=null + reporter_facing_status_after = next + before = current. CHECK constraint `voc_public_updates_skip_reason_min_length` from 0011 already permits the trimmed-length rule.
2. **`voc_reporter_replies` BEFORE INSERT trigger** (`enforce_reporter_reply_actor`, 0010) raises `voc_reporter_reply.actor_must_match_reporter` if `NEW.actor_id <> vocs.reporter_id`. Service-layer check fires first → 403 `permission.denied`; the trigger is defense-in-depth and surfaces as `internal.unexpected` 500 if reached. Acceptable because service guard is on the same SELECT FOR UPDATE row.
3. **`fops_app` GRANT** on the three conversation tables = `SELECT, INSERT` only — append-only enforced at role level. Do not attempt UPDATE/DELETE.
4. **Error codes:** `ERROR_CODES` is a closed enum; add two entries:
   - `reporter_facing_status.invalid_transition` (422)
   - `reporter_facing_status.gate_blocked` (422; reserved, never returned in Slice 3 prod)
   `attachment.unsupported_pending_storage_slice` already exists (#13).
5. **Audit schemas already shipped (#12)** with matching shapes — `publicUpdateCreatedDetailSchema`, `reporterFacingStatusChangedDetailSchema` (carries `paired_with: 'public_update' | 'skip'`), `reporterReplyCreatedDetailSchema`, `internalCommentCreatedDetailSchema`. **Drift:** `internalCommentCreatedDetailSchema.mentions` uses `.min(1)` → blocks the no-mentions path. Relax to `z.array(uuid())` (allow `[]`). No migration; pure shared-package change.
6. **`surface-allowlists.ts`** has loose stubs for the three surfaces. Tighten per issue §5.7 table:
   - `public-update`: nodes `{doc, paragraph, text, bulletList, orderedList, listItem}` / marks `{bold, italic}` / link schemes ∅ / no `mention` / no `attachmentRef`. (Current stub already matches — verify + cover with rejection tests.)
   - `reporter-reply`: nodes `{doc, paragraph, text, bulletList, orderedList, listItem, link, attachmentRef}` per issue (note: link is a mark in current code; keep link as mark, accept `attachmentRef` node but reject non-empty `attachments[]` at value layer). Add `code` mark.
   - `internal-comment`: nodes `{doc, paragraph, text, codeBlock, bulletList, orderedList, listItem, mention, attachmentRef}` / marks `{bold, italic, code, link}` / link schemes `http,https`.
   Add `codeBlock` to internal-comment; allow `link` mark on reporter-reply + internal-comment.
7. **`mention` node** — value layer must validate `attrs.actor_id ∈ request.mentions[]` AND each id resolves to actor in same workspace. Drift → 422 `validation.failed`.
8. **`nextReporterStates()` (#14)** already reads `reporter_facing_status_transitions` seed table — service reuses it for transition validation.
9. **Idempotency frame** = #13 pattern: `pg_advisory_xact_lock(hashtext(actor), hashtext(key))` + `lookup → record → 201`. Hash includes `{vocId, ...body}` (no `If-Match` here — these endpoints don't take `If-Match`).
10. **Permission helpers** — `checkService.check({ actor, capability: 'voc.triage', managedSystemId })` re-evaluated in tx (used by #14 PATCH). Reuse.
11. **Rate-limit tier** — existing `mutation` tier (10/min default). Spec says 60/min for conversation POSTs. **Decision: this issue uses existing `mutation` tier; F21 follow-up filed for dedicated 60/min bucket.** (Same parking pattern as #15's F18.)
12. **Slice 3 exit criterion deferred:** "Reporter can edit title/description/attachments only before triage" is out of scope (issue option a). File follow-up F22.

---

## Chunk breakdown

### C0 — Shared schemas + ADR-0012 enum + sanitizer surface tightening

**Files:**
- `packages/shared/src/errors/codes.ts` — append `reporter_facing_status.invalid_transition`, `reporter_facing_status.gate_blocked`.
- `packages/shared/src/audit/voc.ts` — relax `internalCommentCreatedDetailSchema.mentions` to `z.array(uuid())` (no min).
- `packages/shared/src/vocs/public-update-request.ts` — **new**. Discriminated union on `skip_public_update`:
  - shape A (body+status): `{ skip_public_update: false, body_rich_content: TipTapDoc, next_reporter_facing_status: ReporterFacingStatus }`
  - shape C (skip): `{ skip_public_update: true, skip_reason: string (trimmed length ≥8), next_reporter_facing_status: ReporterFacingStatus }`
  - shape B (body-only) is shape A with the runtime invariant `next === current` — classified server-side.
- `packages/shared/src/vocs/reporter-reply-request.ts` — **new**. `{ body_rich_content: TipTapDoc, attachments?: AttachmentRef[] }`.
- `packages/shared/src/vocs/internal-comment-request.ts` — **new**. `{ body_rich_content: TipTapDoc, mentions?: uuid[] }` (max 50 ids to bound the workspace lookup).
- `packages/shared/src/vocs/index.ts` — re-export new schemas.
- `apps/backend/src/lib/rich-content/surface-allowlists.ts` — tighten per issue §5.7 table (add `code` mark on reporter-reply; add `codeBlock` node + restore `link` mark on internal-comment; verify public-update has empty link-scheme set; add `link` mark on reporter-reply).
- `docs/adr/0012-error-code-contract.md` — append two new codes to the registry table.

**Tests:** `packages/shared/src/vocs/__tests__/{public-update,reporter-reply,internal-comment}-request.test.ts` (zod happy + reject); `apps/backend/src/lib/rich-content/__tests__/surface-allowlists.test.ts` (rejection per surface).

### C1 — Migration 0012 (skip-path body NULL + skip-reason XOR tightening)

**File:** `apps/backend/migrations/0012_slice3_voc_public_update_skip_nullable.sql`.

```sql
ALTER TABLE "voc"."voc_public_updates"
  ALTER COLUMN "body_rich_content" DROP NOT NULL;

-- skip=true  ⇒ body NULL,    skip_reason length ≥ 8 trimmed
-- skip=false ⇒ body NOT NULL, skip_reason IS NULL
ALTER TABLE "voc"."voc_public_updates"
  DROP CONSTRAINT "voc_public_updates_skip_reason_min_length";

ALTER TABLE "voc"."voc_public_updates"
  ADD CONSTRAINT "voc_public_updates_skip_invariants"
  CHECK (
    ("skip_public_update" = true
      AND "body_rich_content" IS NULL
      AND "skip_reason" IS NOT NULL
      AND length(trim("skip_reason")) >= 8)
    OR
    ("skip_public_update" = false
      AND "body_rich_content" IS NOT NULL
      AND "skip_reason" IS NULL)
  );
```

Drizzle schema mirror in `apps/backend/src/db/schema/voc.ts` updated to `jsonb('body_rich_content')` (nullable). Single CHECK enforces all three skip-row invariants (codex cycle-1 fix — DB protects against stale skip_reason on non-skip rows).

### C2 — Conversation repo (`apps/backend/src/modules/voc/repo.ts` extension)

Add:
- `insertPublicUpdate(tx, args: { vocId, actorId, body | null, statusBefore, statusAfter, skip, skipReason | null }): Promise<{ id, created_at }>`.
- `insertReporterReply(tx, args: { vocId, actorId, body }): Promise<{ id, created_at }>`.
- `insertInternalComment(tx, args: { vocId, actorId, body }): Promise<{ id, created_at }>`.
- `updateVocReporterStatus(tx, args: { vocId, nextStatus, expectedUpdatedAt? }): Promise<void>` (no If-Match here; updated_at bumps inside the same tx).

`selectVocForUpdate` from #14 reused.

### C3 — Conversation service (`apps/backend/src/modules/voc/conversation-service.ts` — new)

Three exported commands; all accept `tx: Tx`.

```ts
postPublicUpdate({ tx, actor, vocId, input }):
  Promise<{ public_update: PublicUpdateRow; voc: VocDetailEnvelope }>
postReporterReply({ tx, actor, vocId, input }):
  Promise<{ reporter_reply: ReporterReplyRow; voc: VocDetailEnvelope }>
postInternalComment({ tx, actor, vocId, input }):
  Promise<{ internal_comment: InternalCommentRow; voc: VocDetailEnvelope }>
```

**postPublicUpdate flow:**
1. `selectVocForUpdate` → 404 / `conflict.record_archived` / `conflict.parent_archived` checks (reuse #14 helper).
2. Re-evaluate `voc.triage` capability scoped to `voc.primary_managed_system_id`. Admin bypass. Non-MS dev → 403 `permission.scope_required`.
3. Compute current status. Sanitize body (when present) with `surface: 'public-update'`. Disallowed node/mark → 422 `rich_content.disallowed_node` (mapped to surface error from sanitize.ts).
4. **Transition validation** — load `nextReporterStates(currentStatus, tx)`. If `next === current` and `skip_public_update=false` → body-only path (no status row write). If `next ∈ allowed` → status change. If `next ∈ forbidden` → 422 `reporter_facing_status.invalid_transition` with `detail: { reason }`. Else → 422 `validation.failed`.
5. **Body+skip conflict / shape errors** — zod handles most: `skip_public_update=true && body_rich_content present` → 422 `validation.failed` (zod refine); **skip=true && next_reporter_facing_status === currentStatus → 422 `validation.failed`** (codex cycle-1 fix — skip path is by definition a status change).
6. **Linked-Task gate stub** — call `evaluateReporterStatusGate({ tx, vocId, nextStatus })` → `Promise<null>` in Slice 3. (Wired so Slice 6 can fill it; emits `reporter_facing_status.gate_blocked` when implemented.)
7. INSERT `voc_public_updates` row (body or NULL; before/after statuses; skip + skip_reason or skip=false + skip_reason=NULL — DB CHECK in C1 enforces invariants).
8. If status changed: `UPDATE vocs SET reporter_facing_status = next, updated_at = now() WHERE id = vocId`.
9. Audit:
   - `public_update_created` always; detail `{ voc_id, public_update_id, actor_id, skip_public_update, skip_reason }` (skip=false ⇒ skip_reason null; matches existing `publicUpdateCreatedDetailSchema.refine`).
   - `reporter_facing_status_changed { voc_id, from, to, paired_with: skip ? 'skip' : 'public_update' }` only on status change.
10. Refresh `VocDetailEnvelope` (read-service helper exposing `composeVocDetailEnvelope(tx, vocId)` — extract from #15 read-service).

**postReporterReply flow:**
1. `selectVocForUpdate`. Archive checks.
2. Permission: `actor.actor_id === voc.reporter_id` else 403 `permission.denied`.
3. Sanitize body with `surface: 'reporter-reply'`.
4. If `attachments && attachments.length > 0` → 422 `attachment.unsupported_pending_storage_slice`. **Also** walk sanitized doc; any `attachmentRef` node → 422 `attachment.unsupported_pending_storage_slice` (codex cycle-1 fix — sanitizer allows node, value-layer rejects until storage slice lands).
5. INSERT `voc_reporter_replies`. **Wrap INSERT in try/catch:** Postgres error from `enforce_reporter_reply_actor` trigger (sqlstate or message match) → 403 `permission.denied` (not 500). Defense-in-depth, but mapped (codex cycle-1 fix).
6. Audit `reporter_reply_created`.
7. Refresh envelope.

**postInternalComment flow:**
1. `selectVocForUpdate`. Archive checks.
2. Re-evaluate `voc.triage` scope on `voc.primary_managed_system_id`. Admin OR scoped Developer → allow. Otherwise → 403 (scoped Developer mismatch → `permission.scope_required`; no grant at all → `permission.denied`). **Reporter identity is irrelevant to the deny decision** (codex cycle-1 BLOCKER fix — a reporter who also has voc.triage is allowed).
3. Sanitize body with `surface: 'internal-comment'`.
4. Validate `mentions[]`: **set-equality with body** (codex cycle-1 fix). Extract deduped actor_ids from `mention` nodes in sanitized doc; the resulting set MUST equal the deduped `mentions[]` request array. Drift in either direction → 422 `validation.failed`. Then verify every uuid resolves to an actor in `voc.workspace_id`; cross-workspace → 422 `validation.failed`. Empty `mentions[]` AND zero mention nodes is allowed.
5. INSERT `voc_internal_comments`.
6. Audit `internal_comment_created { mentions: uuid[] }` (empty array allowed — see C0 schema relax).
7. Refresh envelope.

### C4 — Routes (`apps/backend/src/modules/voc/routes.ts` extension)

Three new handlers; preHandler = `requireSession + requireWorkspace`; **rate-limit tier `mutation` attached explicitly** via `...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {})` on each route (codex cycle-1 fix — mirrors POST /vocs + PATCH wiring). Content-Type: Fastify default 415 if non-JSON body sent (documented; no extra handling). Frame:

```ts
const idempotencyKey = requireIdempotencyKey(req.headers);
const vocId = uuidParam(req.params.id);
const rawBody = req.body ?? {};
const parsed = REQUEST_SCHEMA.safeParse(rawBody);
if (!parsed.success) return sendError(reply, 'validation.failed', ...);
const hash = hashRequestBody({ vocId, ...rawBody });
const result = await db.transaction(async (tx) => {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${sess.actor_id}), hashtext(${idempotencyKey}))`);
  const hit = await idempotencyService.lookup(tx, sess.actor_id, idempotencyKey, hash);
  if (hit.kind === 'match')    return { status: hit.status, body: hit.body };
  if (hit.kind === 'mismatch') throw new HttpError('conflict.idempotency_key_reuse', ...);
  const envelope = await conversationService.<verb>({ tx, actor, vocId, input: parsed.data });
  await idempotencyService.record(tx, sess.actor_id, idempotencyKey, hash, 201, envelope);
  return { status: 201, body: envelope };
});
return reply.code(result.status).send(result.body);
```

`VocRoutesOptions` extended with `conversationService`. `server.ts` constructs it.

### C5 — Integration tests (`apps/backend/src/modules/voc/__tests__/`)

Three files, one per endpoint. Each AC bullet → ≥1 test. Real Postgres via `setupTestDb` / `buildServer` (#13/#14/#15 pattern).

1. `post-public-update.integration.test.ts`
   - (a) body + status change → 201; `voc_public_updates` row + `vocs.reporter_facing_status` bumped + 2 audit rows; `paired_with='public_update'`.
   - (b) body only (next === current) → 201; 1 audit row (`public_update_created`); status unchanged.
   - (c) skip + status change → 201; row has body=null skip=true skip_reason set; `paired_with='skip'`.
   - body + status change (next !== current AND next ∈ allowed) → status-change semantics (separate from body-only).
   - body-only with `next` not equal to current AND not in allowed → 422 `reporter_facing_status.invalid_transition`.
   - skip + `next === current` → 422 `validation.failed` (codex cycle-1 fix).
   - skip with `skip_reason.length < 8 trimmed` → 422 `validation.failed`.
   - skip + body present → 422 `validation.failed`.
   - forbidden transition → 422 `reporter_facing_status.invalid_transition` with `detail.reason` from seed.
   - non-MS dev → 403 `permission.scope_required`.
   - `evaluateReporterStatusGate` returns null for sampled transitions; enum value `reporter_facing_status.gate_blocked` present in `ERROR_CODES`.
   - migration 0012 verified: `voc_public_updates.body_rich_content` nullable; skip-row INSERT succeeds; **non-skip row with skip_reason set → CHECK violation**; **skip row with skip_reason length < 8 trimmed → CHECK violation**.
   - rollback: simulate `reporter_facing_status_changed` audit row-write failure → no `voc_public_updates` row remains (single tx).
   - idempotency: same key + same body replay; same key + diff body → 409.
   - archived VOC → 409 `conflict.record_archived`; archived parent MS → 409 `conflict.parent_archived`.
   - rate limit: 11th POST within 60s with default mutation tier → 429 `rate_limited.actor` (codex cycle-1 fix).

2. `post-reporter-reply.integration.test.ts`
   - Reporter on own VOC → 201; audit row.
   - Non-reporter → 403 `permission.denied` (service guard hit, trigger not reached).
   - DB trigger defense-in-depth (codex cycle-1 fix): force-bypass service guard path via direct repo call with wrong actor → trapped trigger error mapped to 403 `permission.denied`, NOT 500.
   - `attachments: [{...}]` → 422 `attachment.unsupported_pending_storage_slice`.
   - `attachments: []` → 201.
   - Body containing `attachmentRef` node → 422 `attachment.unsupported_pending_storage_slice` (codex cycle-1 fix).
   - Status field on envelope unchanged after reply.
   - Idempotency replay; archive checks.
   - Rate limit: 11th POST within 60s → 429 `rate_limited.actor`.

3. `post-internal-comment.integration.test.ts`
   - Admin → 201; same-MS dev → 201; cross-MS dev → 403 `permission.scope_required`; non-triage actor (reporter without grant, plain user) → 403 `permission.denied`.
   - **Reporter who also holds voc.triage on the MS → 201** (codex cycle-1 BLOCKER fix — reporter identity is not a deny condition).
   - `mentions: []` AND no mention nodes → 201; audit `mentions: []`.
   - `mentions: [validUuid]` + body mention node with same actor_id → 201.
   - `mentions: [a, b]` + body mention nodes `{a}` only → 422 `validation.failed` (codex cycle-1 fix — set-equality, mentions[] extra entry).
   - `mentions: [a]` + body mention nodes `{a, b}` → 422 `validation.failed` (set-equality, body extra entry).
   - Cross-workspace mention uuid → 422 `validation.failed`.
   - Idempotency replay; archive checks.
   - Rate limit: 11th POST within 60s → 429 `rate_limited.actor`.

4. Sanitizer surface tests (`apps/backend/src/lib/rich-content/__tests__/surface-allowlists.test.ts`):
   - `public-update` rejects `link`, `attachmentRef`, `mention`, `image` → `rich_content.disallowed_node` (image → `rich_content.external_image_forbidden`).
   - `reporter-reply` accepts `code` mark + `attachmentRef` node + `link` mark.
   - `internal-comment` accepts `mention`, `codeBlock`, `link`.

### C6 — Wiring + verify + 2-cycle review + PR

1. `server.ts` — create `conversationService = createConversationService({ checkService, auditService })`; pass to `vocRoutes`.
2. Run `apps/backend` migrations 0012; `pnpm typecheck`; `pnpm check:boundaries`; `pnpm test`.
3. **Cycle 1 (codex CLI):** `git diff develop..HEAD | codex exec --skip-git-repo-check -` with adversarial-review prompt. Apply fixes; commit.
4. **Cycle 2 (Opus subagent):** general-purpose agent with diff + AGENTS.md context. Apply fixes; commit.
5. `git push -u origin feature/16-voc-conversation-posts`.
6. `gh pr create --base develop` (PR body lists all AC).
7. User merges (squash); branch deleted; issue closed via PR; memory updated; llmwiki bounded-context-voc + triage-lifecycle pages refreshed.

---

## Revisions (codex cycle 1)

| Finding | Severity | Resolution |
|---|---|---|
| Internal-comment denies reporters even with voc.triage | BLOCKER | Auth = Admin OR scoped voc.triage; reporter identity not a deny condition. Test added. |
| Mentions one-way validation | MAJOR | Set-equality: deduped body mention node ids = deduped `mentions[]`. Tests both directions. |
| DB constraint allows stale skip_reason on non-skip rows | MAJOR | Migration 0012 replaces CHECK with full skip-row invariant: skip=true ⇒ body NULL + skip_reason ≥8 trimmed; skip=false ⇒ body NOT NULL + skip_reason IS NULL. |
| Skip path with unchanged status under-spec'd | MAJOR | Service rejects `skip=true && next === current` → 422 `validation.failed`. Test added. |
| Mutation rate-limit wiring omitted in route skeleton | MAJOR | Each new route attaches `rateLimitConfig.mutation`; integration test asserts 429 on 11th call. |
| Reporter-reply `attachmentRef` nodes unvalidated | MAJOR | Sanitizer allows node, but service walks doc + rejects any `attachmentRef` → 422 `attachment.unsupported_pending_storage_slice`. Test added. |
| Trigger error surfaces as 500 | MAJOR | Service catches trigger sqlstate/message and maps to 403 `permission.denied`. Test added. |
| Content-Type requirement unaddressed | MINOR | Fastify default 415 for non-JSON; documented. |
| Public-update audit detail underspec'd | MINOR | Spelled out: `{voc_id, public_update_id, actor_id, skip_public_update, skip_reason}`; skip=false ⇒ skip_reason null (matches existing `.refine`). |
| Body-only test wording confusing | MINOR | Renamed "body + status change" vs "body-only (next===current)". |

## Follow-ups (split out)

- **F21** — dedicated 60/min rate-limit bucket for conversation POSTs (spec §8.5/§8.6/§8.7).
- **F22** — Reporter pre-triage edit of `title`/`description_rich_content` (Slice 3 exit criterion item).
- **F23** — Reporter Reply → follow-up queue signal (Slice 7).
- **F24** — Linked-Task gate runtime evaluation (Slice 6 wires `evaluateReporterStatusGate` to real Task state).

## Out of scope (per issue)

Attachment upload + storage abstraction; entity_links; follow-up queue; reporter pre-triage edit; all frontend (S3-006/007/008).

## Open spec questions resolved here

- **Q3 (Public Update + status change paired)** → three shapes (a/b/c) all supported per AC.
- **Q-STATUSGATECODE** → `reporter_facing_status.gate_blocked` enum added; helper stub returns null in Slice 3.
