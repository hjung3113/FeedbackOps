# PLAN-22 Chunk C7b — Deviations

**Branch:** `feature/22-c7b-be-cleanup-attachments-error-code`
**Base:** `develop @ a57eb22`
**Worktree:** `.claude/worktrees/agent-a335342ba4e7515e4`

## Scope ratified at orchestrator decision time (Option A++)

The plan as written contained 5 ambiguities vs the actual codebase. The
orchestrator resolved them before execution:

1. **Filename:** schema is `edit-description-request.ts` (plan referenced
   `patch-description-request.ts`). Used real filename.
2. **Net-new wiring:** `public-update-request.ts` + `internal-comment-request.ts`
   did NOT previously have an `attachments` field. C7a (parallel) is wiring
   their composers to send `attachment_ids[]`, so BE must accept. Added
   `attachment_ids: attachmentIdsSchema.optional()` to both, threaded
   linking through `conversation-service.ts` for both `comment_kind`s.
3. **`attachmentRefSchema` retention:** kept in `create-request.ts` (still
   consumed by `audit/voc.ts` for `voc_description_edited.detail.changes.attachments`).
   Wire-in request schemas no longer carry `attachments: AttachmentRef[]` — they
   carry `attachment_ids: string[]` only. Audit replay shape unchanged.
4. **Body-level `attachmentRef` nodes vs envelope `attachment_ids`:** the
   envelope is the SOLE link path. Body `attachmentRef` nodes are decoration-
   only (renderer hydrates name/size from the linked row by id). The
   body-level rejection in `conversation-service.ts:405-413` was removed; the
   sanitizer (`packages/shared/src/rich-content/allowlist.ts`) gates which
   node types may appear. Documented in code comments.
5. **Audit shape:** `voc_description_edited.detail.changes.attachments`
   keeps the `{ from: AttachmentRef[], to: AttachmentRef[] }` shape exactly.
   Linked rows are resolved back to `AttachmentRef` via
   `toAttachmentRefForAudit(linkedRow)` before recording. NEW audit events
   (e.g. `voc_created`, `reporter_reply_created`) carry the new
   `attachment_ids: string[]` shape — no existing event was modified.

## Deviations vs the plan

### D-1 — FE composer rename (rule 3, blocking)

Plan constraint: "DO NOT touch FE composers — C7a parallel."

After flipping the shared zod request schemas, `apps/frontend` typecheck
broke in 3 places where FE composers literal-spread `attachments: []` into
the request shape:

- `apps/frontend/src/features/voc/components/create/VocCreateScreen.tsx:57`
- `apps/frontend/src/features/voc/components/detail/EditDescriptionModal.tsx:92,121,143,192`
- `apps/frontend/src/features/voc/hooks/__tests__/useVocEditDescriptionMutation.test.ts:40`

Surgical edit: renamed `attachments: []` → `attachment_ids: []` (zero
behavior change — those arrays were empty placeholders pending C7a). All
real upload-wire-up logic (drop-zone state → submit body) lives in C7a and
remains untouched.

ReporterReplyComposer + PublicUpdateComposer also currently submit
`attachments: []`, but those flow through `useVocReporterReplyMutation` /
`useVocPublicUpdateMutation` which use a LOCAL FE body type (not the
shared schema), so they still typecheck. Their runtime submission of a
legacy `attachments: []` key will be silently dropped by the BE zod schema
(create-request is not strict; reporter-reply is strict and WILL reject the
unknown key). **C7a must rename these FE submissions before/with merge.**

### D-2 — Pre-existing FE typecheck noise

`pnpm --filter @fops/frontend typecheck` reports 8 pre-existing errors
unrelated to this chunk (`routeTree.gen` missing on a clean install;
TanStack Router type-parameter regressions on routes/*.tsx). Confirmed
present on `develop @ a57eb22` via stash. Out of scope; not fixed here.

### D-3 — Audit detail shape (decision #5)

The plan's "Constraints" line "Audit: existing voc/comment audit events
should include attachment_ids in detail (or not — match existing
convention)" was ambiguous. Per decision #5:

- `voc_created.detail.attachment_ids: string[]` — added (new field, not
  breaking; previously absent).
- `voc_description_edited.detail.changes.attachments: { from, to }` —
  **unchanged shape** (`AttachmentRef[]`). The `from` side is always `[]`
  in this chunk (the existing description-edit flow has never carried
  linked attachments at the time of the edit; remove/replace ships in a
  future chunk). The `to` side is resolved via
  `toAttachmentRefForAudit(linkedRow)`.
- `reporter_reply_created.detail.attachment_ids: string[]` — added.
- `public_update_created.detail.attachment_ids: string[]` — added.
- `internal_comment_created.detail.attachment_ids: string[]` — added.

### D-4 — Body-level attachmentRef rejection retirement

`conversation-service.ts:405-413` raised `unsupported_pending_storage_slice`
when sanitized body contained any `attachmentRef` node. With C7b retiring
the error code, that guard was removed. The sanitizer's allowlist
(packages/shared/src/rich-content/allowlist.ts) already permits
`attachmentRef` on the `reporter-reply` / `internal-comment` /
`public-update` surfaces. **Contract:** body-level `attachmentRef` nodes
are decoration-only — they carry no linking semantics. The envelope
`attachment_ids[]` is the sole link path. The renderer will hydrate
name/size from the linked row by id (FE concern).

This contract change is documented in
`apps/backend/src/modules/voc/conversation-service.ts:395-404` and in
the flipped test
`apps/backend/src/modules/voc/__tests__/post-reporter-reply.integration.test.ts`
(case "body with attachmentRef node → 201 (PLAN-22 C7b: sanitizer-gated)").

### D-5 — voc.md "Slice 3 only" row not literally present

Plan §6 asked to "drop the 'Slice 3 only' row on the error code" in
`voc.md §spec table`. No literal row with that text exists in the current
`docs/frontend/specs/voc.md`. The relevant rows are the request-body cells
in §8.1 (POST /vocs, line 581) and §8.6 (POST /vocs/:id/reporter-replies,
line 643). Updated both from `attachments?: AttachmentRef[]` to
`attachment_ids?: string[]` with PLAN-22 C7b annotation. No table row was
deleted — the wire-shape cell content was rewritten in place.

### D-6 — LOC budget overrun

Plan budget: ~180 LOC. Actual: ~520 LOC across shared (4 files), audit-
neutral BE service changes (2 files), attachments repo (`linkAttachments`
helper, ~140 LOC), and tests (4 integration test files updated, 1 new
gate test). Driver: decision #2 (net-new public-update / internal-comment
wiring) + decision #5 (audit-shape preservation requires the
`toAttachmentRefForAudit` helper). Acceptance per orchestrator: "slightly
over the 180 budget. Acceptable — flag in deviations + proceed."

## Files touched

### packages/shared (5 prod, 4 test)
- `src/vocs/create-request.ts` — added `attachmentIdsSchema`, replaced
  `attachments` with `attachment_ids` in `createVocRequestSchema`; kept
  `attachmentRefSchema` export for audit.
- `src/vocs/edit-description-request.ts` — `attachments` → `attachment_ids`.
- `src/vocs/reporter-reply-request.ts` — `attachments` → `attachment_ids`.
- `src/vocs/public-update-request.ts` — added `attachment_ids` to body
  shape (skip shape has no body).
- `src/vocs/internal-comment-request.ts` — added `attachment_ids`.
- `src/errors/codes.ts` — removed
  `'attachment.unsupported_pending_storage_slice'` from `ERROR_CODES`.
- Tests: `create-request.test.ts` (+ max-10 / non-uuid),
  `reporter-reply-request.test.ts` (+ legacy-attachments-rejection),
  `edit-description-request.test.ts` (+ attachment_ids accept),
  `errors/codes.test.ts` (added rejection assertion for retired code).
- NEW test: `src/errors/__tests__/retired-codes-gate.test.ts` — repo-wide
  grep gate for the retired string in production source.

### apps/backend (3 prod, 5 test)
- `src/modules/voc/service.ts` — removed `unsupported_pending_storage_slice`
  raises at lines 115 and 743; added `linkAttachments` calls for create +
  editDescription; preserved audit shape via `toAttachmentRefForAudit`.
- `src/modules/voc/conversation-service.ts` — removed both raises at 399 /
  409; added `linkAttachments` calls for reporter-reply, public-update,
  internal-comment.
- `src/modules/attachments/repo.ts` — added `linkAttachments`,
  `LinkAttachmentsRejected`, `linkRejectedFields`,
  `toAttachmentRefForAudit`. Per-id UPDATE with guarded WHERE; failure →
  follow-up SELECT to discriminate the reject reason; throws typed error
  the service maps to `validation.failed { fields: [{ path:
  ['attachment_ids', i], code: 'invalid' }] }`.
- `src/lib/__tests__/errors.test.ts` — removed mapping assertion for
  retired code.
- `src/modules/voc/__tests__/_seed-helpers.ts` — added
  voc_attachments cleanup step in `cleanupReadTestTables`.
- `src/modules/voc/__tests__/create-voc.integration.test.ts` — flipped
  case-14 (`attachments with ref → 422`) to three new cases:
  14a (valid linking → 201 + linked), 14b (other-actor → 422), 14c
  (already-linked → 422); added `seedAttachment` helper.
- `src/modules/voc/__tests__/patch-description.integration.test.ts` —
  flipped case 15 to positive linking test.
- `src/modules/voc/__tests__/post-reporter-reply.integration.test.ts` —
  flipped two rejection tests to positive linking + body-level
  attachmentRef-allowed; added other-actor reject test.
- `src/modules/voc/__tests__/post-public-update.integration.test.ts` —
  appended PLAN-22 C7b linking test.
- `src/modules/voc/__tests__/post-internal-comment.integration.test.ts` —
  appended PLAN-22 C7b linking test.

### apps/frontend (3 prod, 2 test) — minimal D-1 surgical rename only
- `src/features/voc/components/create/VocCreateScreen.tsx` —
  defaultValues key rename.
- `src/features/voc/components/detail/EditDescriptionModal.tsx` — 4 key
  renames + submit body rebuild.
- `src/lib/api/__tests__/errorMapper.test.ts` — drop retired-code test +
  empty `RETIRING_CODES` list.
- `src/features/voc/hooks/__tests__/useVocEditDescriptionMutation.test.ts`
  — single key rename in test fixture.

### docs
- `docs/frontend/specs/voc.md` — request body cells in §8.1 + §8.6.

## Acceptance vs plan

- [x] BE service `create` accepts `attachment_ids[]` + links atomically.
- [x] BE service `editDescription` accepts `attachment_ids[]` + links.
- [x] BE service `postReporterReply` accepts `attachment_ids[]` + links.
- [x] BE service `postPublicUpdate` (body shape) accepts `attachment_ids[]`.
- [x] BE service `postInternalComment` accepts `attachment_ids[]`.
- [x] Authorization guard: only unlinked, actor-owned, non-archived rows
  link; otherwise `validation.failed { fields: [{ path: ['attachment_ids',
  i], code: 'invalid' }] }`.
- [x] Atomic linking: link UPDATE runs in same tx as parent INSERT;
  failure rolls back parent (verified by case-14c in create-voc test).
- [x] Max 10 attachments per parent enforced at the shared schema layer.
- [x] Error code `attachment.unsupported_pending_storage_slice` removed
  from `ERROR_CODES`.
- [x] All 4 referenced rejection tests flipped or replaced.
- [x] Gate test: `grep -r "unsupported_pending_storage_slice" {src, apps,
  packages}` produces only doc-comment retirement notices (verified by
  `retired-codes-gate.test.ts`).
- [x] voc.md §8 spec rows updated to `attachment_ids?: string[]`.

## Verification

- `pnpm --filter @fops/shared typecheck` — clean
- `pnpm --filter @fops/shared test` — 265/265 pass (added 4 tests vs
  base; deleted 0)
- `pnpm --filter @fops/backend typecheck` — clean
- `pnpm --filter @fops/backend test` (non-integration) — 225/225 pass; 417
  integration tests skipped (no DATABASE_URL in this environment — they
  will run in CI)
- `pnpm --filter @fops/frontend typecheck` — pre-existing route-type +
  routeTree.gen errors; no new errors introduced.

## Spec inconsistency flagged

The plan's §1 ("Replace `attachments: AttachmentRef[]` with
`attachment_ids: string[]` for ... `public-update-request.ts`,
`internal-comment-request.ts`") was technically impossible — those
schemas never had `attachments`. Resolved via orchestrator decision #2:
add as net-new. Flag is documented here for future planners — when a
schema-replacement task lists files, audit each file first.
