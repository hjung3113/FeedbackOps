# Chunk 22-C2 — Deviations

**Branch:** `feature/22-c2-migration-followup`
**Base:** `develop @ d4aab01`
**Commits:** RED `850de8e` → GREEN `85e08c8`

## Starting column state (verified before writing migration)

The column at HEAD-of-`develop` was **`storage_uri`** (per `0010_slice3_voc_foundation.sql:297` and Drizzle schema `voc.ts:219`). The full RENAME path described in PLAN-22 §C2 applies — no rename skip.

Constraints present on `voc.voc_attachments` before 0012:
- `voc_attachments_subject_xor` (from 0010) — required exactly one of {voc_id, comment_id}.
- `voc_attachments_comment_kind_pair` (from 0010) — unchanged by C2.
- `voc_attachments_comment_target_check_trg` (from 0011) — unchanged.
- archive-over-delete columns (from 0011) — unchanged.

## Scope adherence vs PLAN-22 §C2

- ✅ RENAME `storage_uri → storage_key`.
- ✅ UNIQUE on `storage_key`.
- ✅ DROP old XOR; ADD `voc_attachments_subject_not_both` (`NOT (voc_id IS NOT NULL AND comment_id IS NOT NULL)`).
- ✅ ADD `linked_at timestamptz NULL` (no triggers — C3 service layer populates).
- ✅ `uploaded_by_actor_id` already `NOT NULL` from 0010; migration leaves it alone, drift test asserts the no-op.
- ✅ Drizzle schema `apps/backend/src/db/schema/voc.ts` updated to match (field rename, new column, constraint rename + predicate).
- ✅ Drift tests added at `apps/backend/src/db/__tests__/schema-drift-attachments.integration.test.ts` (7 tests, env-gated like all integration suites here).
- ✅ Backend test references to `storage_uri` in raw SQL **inside `voc-foundation.integration.test.ts`** updated to `storage_key`.

## Deliberate non-changes (deviations from a naive read of brief)

1. **`packages/shared/src/vocs/create-request.ts` `attachmentRefSchema.storage_uri` left as-is** — brief is explicit C2 is "Pure DB + repo refs"; the shared `AttachmentRef` is a **request body** field (wire contract), not a column reference. C3 owns the public API rename when the endpoint is shipped (so request-body field rename and 422 reject-non-empty removal land together in one PR). Renaming the field here without the endpoint would break the create-voc / patch-description regression tests that build a 422-shaped fixture against the current frontend contract.

2. **Tests `create-voc.integration.test.ts:676` and `patch-description.integration.test.ts:688`** intentionally untouched for the same reason — they build a request body fixture that asserts the **422 `attachment.unsupported_pending_storage_slice` rejection path** that C3 will retire. Renaming the field here without retiring the rejection would orphan an in-progress contract.

3. **No `conversation-repo.ts` exists** under `apps/backend/src/modules/voc/` (brief speculated). `voc/repo.ts` does not reference `storage_uri` either, so no service-layer code change was required.

4. **Idempotency:** `RENAME COLUMN` cannot be idempotent in standard SQL; documented in the migration header. `linked_at` add uses `IF NOT EXISTS` for safety against partial-replay scenarios. UNIQUE constraint add and CHECK DROP/ADD intentionally not guarded — fops_migrate runs migrations exactly once per deploy and a partial replay would surface loudly.

5. **`packages/shared/src/vocs/__tests__/edit-description-request.test.ts:84`** also references `storage_uri` — same shared-schema field; left alone for the same reason as (1).

## Test count delta

- BE new tests added: **+7** (`schema-drift-attachments.integration.test.ts`).
- BE renamed/edited tests: 1 (XOR constraint name updated in `voc-foundation.integration.test.ts`); not a count change.
- Local run (no Postgres env): 186 passed / 379 skipped / 3 failed. The 3 failures are pre-existing C1 storage tests (`@aws-sdk/client-s3` not installed) and are out of C2 scope.

## Risk notes for the merger of C3

- C3 must drop the `attachment.unsupported_pending_storage_slice` 422 branch from `voc/service.ts:114` and `voc/conversation-service.ts:399` in the **same commit** as renaming `AttachmentRef.storage_uri → storage_key` in `packages/shared/src/vocs/create-request.ts:31`. Otherwise the existing rejection tests will fail with an unrelated diff.
- C3 must also update the seed fixture (`apps/backend/src/seed/voc-fixtures.ts` — if it inserts attachment rows) to use the new column name; not touched here because grep shows no current reference there.

## 2026-05-22 amendment — `voc.voc_attachments` grants (post-merge hotfix)

C2 shipped the column rename (`storage_uri → storage_key`), `linked_at`, and the relaxed XOR. It did **not** touch grants — the `fops_app` role inherited the existing `SELECT, INSERT, UPDATE` privileges from earlier migrations, and no `DELETE` grant existed at C2 GREEN.

Post-merge, the hourly `core.attachments_purge` worker (PLAN-22 §C4b, migration 0014) needed `DELETE` to reclaim unlinked rows >24h. Hotfix migration `0016_grant_app_delete_voc_attachments.sql` (`fix/22-storage-lazy-and-attachments-grants`, commit `c6f361a`) added `GRANT DELETE ON voc.voc_attachments TO fops_app`. User-initiated removals still go through the service-layer archive (`archived_at`, `archived_by_actor_id`) — the grant is purely for the purge worker. See ADR-0011 second 2026-05-22 amendment, PLAN-22 D-20, and `docs/implementation/04-database-and-migrations.md` §"Archive over delete on voc.voc_attachments".
