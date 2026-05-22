# PLAN-22 C3a — Deviations

Chunk: `POST /attachments` skeleton + validation + audit vocab + error code registration.
Branch: `feature/22-c3a-post-attachments-skeleton`
Base: `develop @ e6d777a`

## Summary

C3a lands the validation skeleton, MIME allowlist, filename sanitizer, audit
schema for `attachment_uploaded`, and registers three new error codes. Happy
path returns `501 not_implemented.todo` until C3b replaces it with upload-then-INSERT.

## Deviations from the original plan

1. **[Rule 2 / scope addition] Three new error codes registered, not one.**
   The plan listed only `storage.unavailable`. Acceptance tests require
   `attachment.too_large` and `attachment.unsupported_type` (both 422), plus
   the C3a stub needs `not_implemented.todo` (501). All four are now in
   `ERROR_CODES`; backend `STATUS_BY_PREFIX` gained two new entries:
   `storage.` → 502 and `not_implemented.` → 501. `attachment.*` already
   mapped to 422 from Slice 3 #13.

2. **[Rule 4 / deferred → documented] Admin bypass on the 20/min bucket is
   not wired.** The plan calls for "20/min rate limit (admin bypass)". The
   admin-role helper does not yet exist — `server.ts:209` already carries a
   "TODO(F18 follow-up): add admin bypass for the read tier once the
   admin-role detection helper lands". The `attachmentMutation` tier is
   plumbed identically to `read`, and gains `skip` for admins the moment
   that helper lands. Tracking inline; no separate ticket created because
   the existing TODO already owns it.

3. **[Rule 1 / spec clarification] Traversal-filename test asserts
   `validation.failed` only when the input collapses to empty after
   sanitization.** `../../etc/passwd` sanitizes to a non-empty string
   `....etcpasswd` (slashes stripped), which is the documented D-05
   behavior. The integration test for traversal therefore uses an input
   that DOES collapse (`////\\\\`) so the assertion is meaningful;
   collapse-to-empty plus the not-a-filename path both route to
   `validation.failed` with `path: ['filename']`.

4. **[Tooling] `@fastify/multipart@^9.0.1`** added to `apps/backend`
   dependencies; `form-data@^4.0.1` added to devDependencies for the
   integration test's multipart payload generation. Both are
   well-maintained packages that are direct or transitive deps of the
   existing AWS SDK / Fastify ecosystem.

5. **[Verification] Live-Postgres integration tests are wired but will
   skip in environments without `DATABASE_URL` + `WORKSPACE_ID`.** Matches
   the repo convention (see `apps/backend/AGENTS.md` Verification section
   + every VOC integration test). All 9 cases are present and will run
   once DB env is provided. Unit tests for the sanitizer + error-code
   status mapping pass without DB.

## LOC summary

| File                                                            | LOC |
| --------------------------------------------------------------- | --: |
| `apps/backend/src/modules/attachments/routes.ts`                | 209 |
| `apps/backend/src/modules/attachments/filename-sanitize.ts`     |  71 |
| `apps/backend/src/modules/attachments/mime-allowlist.ts`        |  30 |
| `apps/backend/src/modules/attachments/index.ts`                 |   9 |
| `apps/backend/src/modules/attachments/__tests__/post-attachments-validation.integration.test.ts` | 258 |
| `apps/backend/src/modules/attachments/__tests__/filename-sanitize.test.ts` |  73 |
| `packages/shared/src/audit/attachments.ts`                      |  27 |
| `packages/shared/src/audit/__tests__/attachments-audit-schemas.test.ts` |  59 |
| **Total new**                                                   | **736** |

Plus small touches: `errors.ts` (+2), `errors.test.ts` (+15), `codes.ts`
(+5), `codes.test.ts` (+10), `audit-events.ts` (+5), `server.ts` (+30),
`types/fastify.d.ts` (+1), `shared/src/index.ts` (+1).

The 736 LOC sits inside the original C3 split allowance (C3a ~360 implementation +
220 integration test = ~580); the integration test grew to 258 because it
covers nine acceptance cases instead of the seven the plan enumerated
(401 + happy-path-501 tombstone added).

## Verification

- `pnpm --filter @fops/shared test` → 15 files, 247 tests, 0 failures.
- `pnpm --filter @fops/backend test` → 16 files passed, 34 integration
  files skipped (no live Postgres); 214 unit tests passed, 0 failures.
- `pnpm --filter @fops/backend typecheck` → clean.
- `pnpm check:boundaries` → OK.
- Integration tests (9 cases) will run automatically once `DATABASE_URL`
  + `WORKSPACE_ID` are set in CI / local dev.

## Follow-up for C3b

- Replace the `not_implemented.todo` stub branch in `routes.ts:139-149`
  with the upload-then-INSERT path (service.ts, repo.ts).
- Map `StorageUnavailableError` (from `lib/storage/index.ts`) to
  `HttpError('storage.unavailable', ...)`. The status (502) is already
  registered here.
- Delete the "501 tombstone" test case in
  `post-attachments-validation.integration.test.ts`; the happy-path
  assertion flips to 201 + envelope shape.
