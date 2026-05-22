# PLAN-22 C4b — Deviations

Branch: `feature/22-c4b-purge-unlinked-attachments`
Base: `develop` @ `9078e6c` (post-PR-64).

## Deviations from plan

### D1 — Added migration 0014 (queue pre-creation)

The plan listed only the job module, the index registration, and the integration test.
It did **not** call out a migration for pre-creating the pg-boss queue, but the existing
`registerCoreJobs` boot path (idempotency + rate-limits siblings) throws if its queue is
not pre-created in a migration — `fops_app` cannot DDL via `pgboss.create_queue`
(F-010 / ADR-0008, migration 0007 shim). Without the pre-creation `registerCoreJobs`
would fail at app startup.

Added `apps/backend/migrations/0014_attachments_purge_queue.sql` plus matching journal
entry, mirroring `0004_rate_limits_purge_queue.sql` column-for-column (ADR-0009 retry
config: `retry_limit=5, retry_delay=30, retry_backoff=true`). Rule 3 — blocking work
required to satisfy the plan’s “registered with hourly cron” acceptance criterion.

### D2 — Queue name: `core.attachments_purge`

Plan refers to the job functionally as `purge_unlinked_attachments`. Used the existing
`<module>.<action>` convention (ADR-0009) for the pg-boss queue name — `core.attachments_purge`
— matching the two sibling queues (`core.idempotency_purge`, `core.rate_limits_purge`).
`Core` owns shared attachment governance per `apps/backend/src/modules/core/AGENTS.md`.

### D3 — Cron offset: `30 * * * *`

Plan specified hourly cron. Picked `30 * * * *` so the three hourly Core purges stagger
across the hour (`0`, `15`, `30`) — same pattern the rate-limits-purge introduced
in `0004` to spread DB load.

### D4 — Storage-delete failure policy: keep DB row

When `storage.delete` throws for a row, the handler logs and **skips the DB delete** for
that row. Next hourly run retries. Rationale: if we drop the DB pointer while the object
is still in storage, we lose our only handle on the unreachable object. Plan §C4b
guidance: “If storage.delete fails, leave the DB row in place so next run retries.
This is safer.” Encoded as `storage_delete_failures` counter in the return value and
asserted by the “survives storage.delete failure” test.

### D5 — Boot test extended

`boot.integration.test.ts` now also asserts the `core.attachments_purge` schedule + queue
config rows. Required by acceptance criterion “registered with hourly cron in job index”.
Also passes `pool` + `storage` (stub `StorageBackend`) into `registerCoreJobs` so the
new job actually registers in the boot flow.

## Files touched

- `apps/backend/migrations/0014_attachments_purge_queue.sql` (new, ~36 LOC)
- `apps/backend/migrations/meta/_journal.json` (1 entry appended)
- `apps/backend/src/modules/core/jobs/purge-unlinked-attachments.ts` (new, ~155 LOC)
- `apps/backend/src/modules/core/jobs/__tests__/purge-unlinked-attachments.integration.test.ts` (new, ~225 LOC)
- `apps/backend/src/modules/core/jobs/index.ts` (+24 / -3)
- `apps/backend/src/modules/core/jobs/__tests__/boot.integration.test.ts` (+47 / -1)
- `apps/backend/src/index.ts` (+5 / -1) — wires `pool` + `getStorage()` into `registerCoreJobs`

Total ≈ 290 LOC (impl + test + migration). Budget was ~240 — the +50 is the migration
(D1) and the boot-test extension (D5), both required by the “registered with hourly cron”
acceptance criterion.

## Verification

- `pnpm --filter @fops/backend typecheck` — clean.
- `pnpm --filter @fops/backend test` — 214 passed / 403 skipped / 0 failed. New file
  `purge-unlinked-attachments.integration.test.ts` discovered (7 tests skipped without
  `DATABASE_URL` per existing integration-skip convention; will exercise live Postgres
  in CI).
- `pnpm check:boundaries` — OK.

Integration suite skips locally without `DATABASE_URL` + `DATABASE_URL_MIGRATE` +
`WORKSPACE_ID` — same gate the sibling idempotency-purge and rate-limits-purge integration
tests use. CI / a developer with the seeded DB exercises them end-to-end.

## Constraints honoured

- Did **not** touch `apps/backend/src/modules/attachments/routes.ts` or `service.ts`
  (C4a territory).
- Did **not** touch `packages/shared/src/vocs/*` or `apps/frontend/*` (C5 territory).
- Did **not** modify the storage backend (`apps/backend/src/lib/storage/*` is read-only
  in this chunk; only the `StorageBackend` interface is consumed).

## 2026-05-22 amendment — DB DELETE grant (post-merge hotfix)

The purge job's `DELETE FROM voc.voc_attachments WHERE id = $1` assumes the `fops_app` role
has `DELETE` privilege on `voc.voc_attachments`. At C4b merge time this grant was **not**
in any migration; the integration test passed because `DATABASE_URL`-gated runs use the
migration superuser, masking the missing grant in CI. Production runs would have failed
silently (job logs an error, leaves the row in place — see D4 above — but never reclaims).

Hotfix migration `0016_grant_app_delete_voc_attachments.sql`
(`fix/22-storage-lazy-and-attachments-grants`, commit `c6f361a`) added
`GRANT DELETE ON voc.voc_attachments TO fops_app`. The archive-over-delete invariant for
**user-initiated paths** is unchanged and still enforced at the service layer; the grant
exists strictly so this purge worker can do its job. See ADR-0011 second 2026-05-22
amendment, PLAN-22 D-20, and `docs/implementation/04-database-and-migrations.md`
§"Archive over delete on voc.voc_attachments".
