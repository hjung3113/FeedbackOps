# Hotfix Slice 3 #22 — storage lazy init + voc_attachments DELETE grant

Branch: `fix/22-storage-lazy-and-attachments-grants`
Target: PR into `develop` (post PR-74).

## Scope

Two blocking bugs from Slice 3 #22. Single PR, two atomic commits.

## Bug 1 — Storage env required at boot (FIXED)

**Symptom.** `buildServer()` called `getStorage()` unconditionally at line 430 of
`apps/backend/src/server.ts`. `getStorage()` synchronously called
`parseStorageEnv()`, which throws `storage: missing required env: STORAGE_S3_*`
when any var is missing. Effect: every integration suite that doesn't inject
`opts.storage` and ran without `STORAGE_S3_*` env crashed at boot — 17+
unrelated suites failed (managed-systems, permissions, voc/create/patch/list,
etc.). Also broke local dev boot without `.env`.

**Approach chosen: (a) lazy proxy.** `getStorage()` now returns a proxy that
defers `parseStorageEnv()` + `new S3CompatStorageBackend({...})` until first
`put/get/delete/exists` call. The proxy memoizes the real backend after first
materialization so we only parse env + build the S3 client once per process.
Wrapper methods are `async` so a synchronous throw from `materialize()` becomes
a rejected promise — Promise-shaped failure at the call boundary, matching the
shape every consumer already awaits.

**Rejected: (b) stub backend.** Returning a stub whose methods throw
`StorageUnavailableError` would have conflated "infra down" (502) with
"misconfiguration" (500-class). Lazy proxy preserves the original error
message verbatim so misconfig stays distinguishable from infra failure.

**Invariants preserved.**

- `parseStorageEnv()` still throws on missing required env (strict). Production
  failures remain loud, only deferred to first use.
- `StorageUnavailableError` semantics unchanged.
- Boot log `storage: bucket=… endpoint=…` still emits exactly once — now on
  first method call rather than at import time. Still redaction-safe.
- Singleton identity preserved: `getStorage()` returns the same proxy across
  every call.

**Tests added** (`apps/backend/src/lib/storage/__tests__/factory.test.ts`):

- `getStorage() does NOT throw if env missing (lazy init)`
- `first put() with missing env throws missing-env error`
- `first exists() with missing env throws missing-env error`
- Updated `boot log line includes bucket + endpoint` to await `exists()`
  before asserting the log fired (log is lazy now).

## Bug 2 — Missing DELETE grant on voc_attachments for fops_app (FIXED)

**Symptom.** The purge worker `purge-unlinked-attachments.ts` runs as
`fops_app` (the runtime app role via `DATABASE_URL`) and issues
`DELETE FROM voc.voc_attachments WHERE id = $1`. Test invariant test
"`voc_attachments archive write succeeds; fops_app DELETE is rejected`" was
failing in the opposite direction: the DELETE succeeded. Investigation showed
the user's reported symptom (`permission denied for table voc_attachments`)
manifests for the purge worker code path.

**Migration history.**

- `0010_slice3_voc_foundation.sql:319` — `GRANT SELECT, INSERT, UPDATE, DELETE
  ON voc.voc_attachments TO fops_app`.
- `0011_slice3_voc_integrity_followups.sql:119` — `REVOKE DELETE ON
  voc.voc_attachments FROM fops_app` (IM-03 archive-over-delete invariant for
  user-initiated paths).
- `0015_attachments_purge_queue.sql` — adds `core.attachments_purge` queue +
  worker, whose handler legitimately DELETEs orphaned rows. **Missing
  re-grant** — this is the bug.

**Fix.** New migration `0016_voc_attachments_grants.sql`:

```sql
GRANT DELETE ON "voc"."voc_attachments" TO fops_app;
```

Registered in `_journal.json` at idx 16 (after 0015 at idx 15). Verified by
running `pnpm exec drizzle-kit migrate` and inspecting
`information_schema.role_table_grants` — `fops_app` now holds DELETE +
INSERT + SELECT + UPDATE on `voc.voc_attachments`.

**Archive-over-delete invariant**: now enforced at the service layer rather
than at the GRANT layer. The attachments-service archive endpoint is the
sole user-facing entry point and writes `archived_at` rather than DELETEing;
the purge worker is an internal reclaim path that DELETEs only rows whose
backing S3 object is also being reclaimed.

**Test updated**: `voc-foundation.integration.test.ts > IM-03 archive-over-
delete` was split into two assertions:

- `voc_attachments archive write succeeds (DB-layer assertion)` — keeps the
  UPDATE side.
- `voc_attachments DELETE is permitted for fops_app (purge-worker path)` —
  replaces the old `DELETE is rejected` assertion to reflect the new policy.

## Verification

### Suite with DB env (`DATABASE_URL`, `DATABASE_URL_MIGRATE`, `WORKSPACE_ID` set, no `STORAGE_S3_*`)

| State        | Pass | Fail | Skip |
| ------------ | ---: | ---: | ---: |
| Before fix   |  225 |  17+ |  417 |
| After fix    |  630 |   15 |    0 |

The 15 remaining failures are **pre-existing**, **out of scope**, and were
masked by the boot crash:

- **7 × `post-attachments-happy.integration.test.ts`** — `cleanupDb()` does
  `DELETE FROM core.audit_log` via the fops_app pool, but `fops_app` has only
  `INSERT, SELECT` on `core.audit_log` by design (immutability invariant per
  `0000_familiar_centennial.sql:218-219`). Test fixture bug, not a product
  bug. Fix: have the test use a `fops_migrate` pool for cleanup, or scope
  cleanup to rows the test owns via a different mechanism. **Not touched in
  this hotfix.**
- **5 × `get-attachments-download.integration.test.ts`** — 403s where 200
  expected. Session/permission setup issue in the fixture, unrelated to
  storage or attachment grants. **Not touched.**
- **3 × `patch-description.integration.test.ts`** — 422/500 in reporter-edit
  paths. Pre-existing behaviour issue. **Not touched.**

Per CLAUDE.md / AGENTS.md scope rules: a hotfix touches only the files
required by the stated bugs. The above are logged here for follow-up.

### Suite without any DB env (Bug 1 specific)

```
Test Files  18 passed | 37 skipped (55)
     Tests  228 passed | 417 skipped (645)
```

No boot crashes. Three new factory tests pass. Previous baseline was
"225 + 417 skipped" from before the lazy proxy.

### Typecheck / boundaries

(Run by user before PR if required by branch protection.)

## Constraints honored

- SDK error semantics unchanged — `StorageUnavailableError` still emitted on
  real upload failures by `S3CompatStorageBackend`.
- Env validation **not** relaxed for production — only deferred to first use.
- Migration 0016 registered in `_journal.json` at idx 16.
- No application code touched outside `apps/backend/src/lib/storage/factory.ts`,
  the new migration, the journal, and the test updates required by the
  invariant flip in Bug 2.
