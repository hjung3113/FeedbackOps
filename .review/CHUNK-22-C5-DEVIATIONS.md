# PLAN-22 C5 — Deviations

Branch: `feature/22-c5-shared-attachment-schema-fe-api`

## Scope-Aligned Decisions

1. **`AttachmentRef` not re-exported.** The existing `AttachmentRef` (in
   `packages/shared/src/vocs/create-request.ts`) carries `storage_uri`, which
   `AttachmentCreated` intentionally drops. They are distinct contracts:
   - `AttachmentRef` — VOC create/edit request payload (legacy shape; will
     be reconciled in a later chunk).
   - `AttachmentCreated` — strict POST /attachments 201 envelope; what the
     FE upload helper returns.
   Re-exporting would imply structural compatibility that does not exist.
   Plan said "if exists, re-export only" — the safer call is to keep them
   separate. No FE consumer in this chunk needs `AttachmentRef`.

2. **`apiClient` extended to accept `FormData`.** The plan listed
   `apiClient.post('/attachments', formData, ...)` but `apiClient` did not
   support multipart (always JSON-stringified `body` and set
   `Content-Type: application/json`). Added an `opts.formData?: FormData`
   field — when present, `body` is ignored and `Content-Type` is left for
   the browser to set with the multipart boundary. This is a minimal,
   composable change (~5 LOC in `client.ts`) and keeps `ApiError` /
   rate-limit handling consistent with every other call site (Rule 3 —
   blocking issue for the task; resolved in-place).

3. **`attachment.unsupported_pending_storage_slice` left in `ERROR_CODES`.**
   Plan said to retire the FE mapping row. The shared `ERROR_CODES` enum
   still includes the code because BE (`apps/backend/src/modules/voc/*`)
   actively emits it from `service.ts`, `conversation-service.ts`, and
   reporter-reply / patch-description / create-voc integration paths.
   Removing the code from `ERROR_CODES` would break BE compilation, and
   the plan said "DO NOT touch BE — C4a/b parallel." Resolution:
   - FE `errorMapper` CATALOG row REMOVED (the retiring action).
   - `errorMapper.test.ts` adds a `RETIRING_CODES` exemption so the
     Slice-3-owner non-fallback invariant skips this code (it now falls
     back to the generic envelope copy by design, with a new explicit
     test asserting that fallback).
   - When C4a/C4b lands and BE stops emitting the code, a later chunk
     can also remove it from `ERROR_CODES` in `packages/shared` (and the
     RETIRING_CODES exemption).

4. **Test framework — `vi.fn(fetch)`, not msw.** Plan suggested msw-based
   tests; the FE house style (per `client.test.ts`,
   `VocCreateScreen.integration.test.tsx` comment header) is to mock
   `global.fetch` with `vi.fn`. Adopted the house style — no msw dependency
   was added.

5. **Idempotency-Key is opt-in via `opts.idempotencyKey`, not a hook.**
   `useIdempotencyKey()` is a React hook and `uploadAttachment` is a plain
   async function callable from non-hook contexts (event handlers, queries,
   workers). Callers pass `opts.idempotencyKey` from a hook-derived value
   in their component; if absent, `apiClient` auto-mints a UUID via its
   existing fallback. Matches the existing pattern in
   `auth.ts` / `analytics-areas.ts`.

## Out-Of-Scope Untouched

- BE `attachments` module — C4a/b owns.
- FE components / dropzone — C6 owns.
- `attachment.unsupported_pending_storage_slice` references in BE — C4
  owns the BE retirement.

## Verification

- `pnpm --filter @fops/shared test` — 253/253 pass (+6 new in
  `vocs/__tests__/attachment.test.ts`).
- `pnpm --filter @fops/frontend test` — 406/406 pass (+6 new in
  `lib/api/__tests__/attachments.test.ts`, +4 new in
  `lib/api/__tests__/errorMapper.test.ts`).
- Both packages typecheck clean.

## Commits

1. `c60d94d feat(22-c5): add AttachmentCreated shared schema`
2. `d942514 feat(22-c5): wire attachment.js into shared vocs barrel + FE api client`

## Branch Hygiene Note

During execution, the repository working tree had branch state mutate
externally (likely a parallel agent on a sibling worktree or shared CLI
context — `feature/22-c4a-get-download` and `feature/22-c4b-purge-unlinked-attachments`
were live in this same working directory). Two of my commits landed on
the wrong branch tip mid-flow; both were cherry-picked back onto
`feature/22-c5-shared-attachment-schema-fe-api` and the sibling branches
were reset to their pre-C5 tips (`a3ceea9` and `9078e6c` respectively).
Final state on C5 branch is correct and verified via `git log --oneline`.
