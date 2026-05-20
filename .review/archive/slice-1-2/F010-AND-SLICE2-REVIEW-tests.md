# Test coverage adversarial review (commits a062062..HEAD)

Scope: Slice 2 #8 (F-010 shim), #9 (registry schema), #10 (Managed System write path), #11 (Analytics Area write path + cascade activation). Backend integration suites under `apps/backend/src/modules/{managed-systems,analytics-areas,core/jobs,permissions,auth}/__tests__` and `apps/backend/src/db/__tests__`; frontend route + picker tests under `apps/frontend/src`.

## Critical

### C1. No tenant-isolation test — user in workspace B can drive endpoints scoped to workspace A
**Where:** (missing test) — every integration suite hard-codes `WORKSPACE_ID` env and the `requireWorkspace(workspaceId)` middleware to one tenant.
**Why it matters:** ADR-0017 audit detail schema for `analytics_area_registered` embeds `workspace_id`, the service writes `workspace_id` into every row, but no test fails when a session for actor in workspace B targets `/managed-systems` (or `/analytics-areas`) for workspace A. The whole "Managed System is workspace-scoped, slug reuse is per-workspace" invariant (`docs/adr/0017:38` "`(workspace_id, slug)` is a partial unique index") has zero negative coverage. The CheckService has a `workspace_mismatch` branch (`apps/backend/src/modules/permissions/check-service.ts:80-82`) but nothing asserts that branch fires for MS/AA mutations.
**Recommendation:** Add an integration test that seeds a second workspace + admin actor in `core.actors`, logs in as that actor, POSTs `/managed-systems`, and asserts the response cannot leak workspace A rows on GET. Also assert a GET of `/managed-systems?slug=<wsA-only-slug>` from a wsB session returns zero items.

### C2. Idempotency `conflict.idempotency_key_reuse` (same key + different body) untested
**Where:** (missing test) — service code lives at `apps/backend/src/modules/managed-systems/managed-system-service.ts:163-168` and `apps/backend/src/modules/analytics-areas/analytics-area-service.ts:228-233`; replays of the same `Idempotency-Key` with a different payload throw `conflict.idempotency_key_reuse`.
**Why it matters:** ADR-0015:71-90 ("Idempotency-Key reuse with a different request body MUST return 409") is the load-bearing F-005 follow-up. The existing replay test (`managed-system.integration.test.ts:160-196`) sends the *same* body twice and only covers the happy match path. A regression that silently treats the mismatch as a fresh insert would not fail any test.
**Recommendation:** In `managed-system.integration.test.ts`, replay the same UUIDv4 key with a different `name` and assert 409 + `conflict.idempotency_key_reuse`. Mirror for `analytics-area.integration.test.ts`.

### C3. F-010 SECURITY DEFINER shim has no case/whitespace bypass coverage
**Where:** `apps/backend/migrations/0007_pgboss_create_queue_shim.sql` is asserted only for the literal string `options->>'partition' = 'true'` in `apps/backend/src/db/__tests__/migration.test.ts:213`, and the runtime test (`role-grants.integration.test.ts:129-139`) only sends `'{"partition":true}'::jsonb`.
**Why it matters:** ADR-0009 + the Slice 2 #8 commit message lock the bypass-elevation surface. JSON booleans serialize as lower-case `true`, but if the shim's predicate is later edited to coerce a string-valued `"True"` / `"TRUE"` / `1`, no test will catch it. The shim's bypass risk is exactly the F-010 root cause.
**Recommendation:** Add positive tests asserting partition `false` succeeds (today's comment at `role-grants.integration.test.ts:141-144` waves it off, but a direct call is one line) and add negative tests for adjacent payloads that *should also* reject: `{"partition":"true"}` (string), `{"partition":1}` (number), and `{"PARTITION":true}` (case-folded key). Each should map to a documented behavior — either reject or pass — and be pinned.

### C4. MS archive cascade has no partial-failure / rollback test
**Where:** (missing test) — `managed-system-service.ts:455-470` calls `cascadeArchiveActiveChildren` inside the parent tx; a child audit insert failure must roll back the parent archive.
**Why it matters:** ADR-0017:58 "Archiving a Managed System automatically archives all of its non-archived Analytics Areas **in the same transaction**" is the cascade atomicity guarantee. The success test (`analytics-area.integration.test.ts:308-362`) only walks the happy path. If a future refactor moves the audit insert outside the tx, no test fails.
**Recommendation:** Inject a failing `auditService` (the AA cascade audit row) into one cascade iteration via a service-level unit test and assert: (a) the call rejects, (b) the parent MS row is still `archived_at IS NULL` after rollback, (c) no AA rows were partially archived. A pure unit test against `cascadeArchiveActiveChildren` with a mock `tx` + `auditService` is sufficient.

## High

### H1. Archive of non-existent MS / AA — no `not_found.record` negative test
**Where:** (missing test) — service: `managed-system-service.ts:418-420` and `analytics-area-service.ts:458-460`.
**Why it matters:** Cascade idempotency reviewer prompt explicitly asks "archiving non-existent MS". Bug class: a future change that conflates "row not found" with "already archived" would silently succeed. ADR-0017 implies archive is only meaningful for an existing row.
**Recommendation:** POST `/managed-systems/<random uuid>/archive` and assert 404 + `not_found.record`; same for `/analytics-areas/<random uuid>/archive` and PATCH on both.

### H2. AA under archived MS — "editable? archivable? unarchivable?" undefined and untested
**Where:** (missing test) — `analytics-area-service.ts:319-422` (`updateAnalyticsArea`) has zero guard against a parent MS that is archived; only `registerAnalyticsArea` checks `conflict.parent_archived` (line 252-258).
**Why it matters:** Reviewer prompt asks parent_archived semantics for AA mutation. The cascade archives AAs alongside MS, so an "active AA under archived MS" should be impossible via the API — but it is reachable via direct SQL or via a race where a different admin archives the MS between two AA-edit requests. The current code will happily PATCH a still-active AA whose parent has just been archived in a parallel tx. No test pins whether that is intended (silent allow) or a bug.
**Recommendation:** Add an integration test that (a) creates MS + AA, (b) archives MS (cascade archives AA), (c) PATCH the AA and assert behavior — likely 409 `conflict.parent_archived` or 404. Whatever the answer, pin it. Same for explicit standalone archive of an already-cascaded AA (currently `archiveAnalyticsArea` returns 200 idempotently per `analytics-area-service.ts:461-474`; this passes today but is undocumented).

### H3. AA create where parent MS belongs to a different workspace untested
**Where:** (missing test) — `analytics-area-service.ts:249-251` returns `not_found.record` for cross-workspace MS reference.
**Why it matters:** This is the tenant-isolation surface for AA writes. Without a test, a future "scope by id only, not workspace" refactor would leak AAs across tenants and the audit row would record a workspace mismatch.
**Recommendation:** Seed a second workspace with an MS, log in as wsA admin, POST AA with `managed_system_id` = wsB's MS id, assert 404 `not_found.record`. (Depends on C1 helper.)

### H4. MS default_owner XOR on PATCH untested
**Where:** (missing test) — `managed-system-service.ts:328-342` rejects `validation.failed` when a PATCH would leave both `default_owner_actor_id` and `default_owner_team_id` set.
**Why it matters:** ADR-0018:36 "CHECK: at most one of (default_owner_actor_id, default_owner_team_id) is non-null" is enforced at three layers: DB (asserted in `managed-systems.integration.test.ts:43-57`), service POST (line 143-149, untested), and service PATCH (line 328-342, untested). DB-level rejection bubbles to 500. The friendlier service-level 422 is exactly what the comment on line 326-328 says is the point.
**Recommendation:** Two tests: (a) POST with both fields set, assert 422 `validation.failed` not 500. (b) Create MS with actor owner, PATCH to set team owner without clearing actor, assert 422 `validation.failed`.

### H5. Permission denial paths do not assert "no row inserted, no audit row"
**Where:** `apps/backend/src/modules/managed-systems/__tests__/managed-system.integration.test.ts:114-128` asserts MS row count is 0 after non-admin POST, but does not assert audit_log was untouched. `analytics-area.integration.test.ts:131-142` does not check the AA row count either.
**Why it matters:** AGENTS.md "every mutation test asserts audit_log row in same tx" — the negative direction matters equally. A capability gate that fires *after* writing an audit row would corrupt the immutable log. ADR-0008 audit-log is INSERT-only by fops_app.
**Recommendation:** Add `select count(*) from core.audit_log where event_type='managed_system_registered' and workspace_id = $1` → 0 after the 403, and the parallel AA assertion. Also assert no `core.idempotency_keys` row was reserved.

### H6. pg-boss job-handler failure → retry not tested
**Where:** `apps/backend/src/modules/core/jobs/__tests__/boot.integration.test.ts:53-92` asserts the `pgboss.queue.retry_limit/delay/backoff` columns are present, but no test fires a job that throws and asserts pg-boss schedules a retry.
**Why it matters:** ADR-0009:22-27 retry semantics are load-bearing for purge jobs. The current test pins config but not behavior — a regression that wires retry_limit=5 but ignores the handler's thrown error would not fail any test. Reviewer prompt: "job handler error → retry."
**Recommendation:** Submit a job through `boss.send(IDEMPOTENCY_PURGE_QUEUE, …)` with a handler that throws once and succeeds on second invocation; poll `pgboss.job` for retry count >= 1. Or unit-level: wrap `purgeExpiredIdempotencyKeys` with a throwing stub and assert the registered handler propagates the rejection.

### H7. Migration count assertion is fragile and will block-line every future slice
**Where:** `apps/backend/src/db/__tests__/migration.test.ts:24-27` — `expect(files).toHaveLength(8)`.
**Why it matters:** Every Slice 3+ migration will silently break the suite. AGENTS.md "Pattern consistency < correctness" — this assertion encodes a snapshot that has no invariant value: nobody re-reads it before adding a migration.
**Recommendation:** Replace with `expect(files.length).toBeGreaterThanOrEqual(8)` and assert the specific Slice 2 filenames by prefix match. Or drop the count assertion and rely on the per-file content checks that already exist (lines 67, 121, 139, 186, 217).

## Medium

### M1. Audit `update` empty-changes path tested for response but not for service-level rejection
**Where:** `managed-system.integration.test.ts:222-242` and `analytics-area.integration.test.ts:236-246` assert 200 + no audit row for a no-op PATCH.
**Why it matters:** The audit schema `managedSystemUpdatedDetailSchema` (`packages/shared/src/enums/audit-events.ts:74-76`) refuses an empty `changes` map. The service code-path that avoids emitting the row is the only thing keeping the schema valid. A future refactor that calls `auditService.record` with empty `changes` would throw at runtime but no test pins the schema-level guard.
**Recommendation:** Add a unit test against `auditEventDetailSchemas.managed_system_updated.parse({ managed_system_id: …, changes: {} })` and assert it throws. Same for AA.

### M2. Concurrent same-key idempotency race (`onConflictDoNothing`) untested
**Where:** `apps/backend/src/modules/core/idempotency/idempotency-service.ts:79-90` — comment on line 70-78 documents F-005's "two concurrent first-time requests" race and the chosen resolution.
**Why it matters:** ADR-0015:71-90. The documented behavior — losing tx silently observes the winning row on retry — has no test. A regression that drops `onConflictDoNothing` would surface as a 500 in concurrent production traffic.
**Recommendation:** Open two `appHandle.pool` clients, BEGIN both, both call `idempotencyService.record(...)` with the same `(actorId, key)`, COMMIT both. Assert one row, no thrown error.

### M3. List ordering not asserted
**Where:** `analytics-area.integration.test.ts:365-399` asserts `total` only. `analytics-area-service.ts:528` orders by `(managedSystemId, slug)`.
**Why it matters:** Frontend grouping (`apps/frontend/src/routes/admin/analytics-areas.tsx`) depends on a stable order to render `aa-group-ms-tab` / `aa-group-ms-pbi`. ADR-0017 does not lock ordering, but the admin UI silently depends on it.
**Recommendation:** Insert 3 AAs across 2 MSs with deliberately out-of-order slugs and assert `items.map(r => r.slug)` matches the (MS-id, slug) sort.

### M4. Frontend MS admin missing tests: archive button, include-archived toggle, edit save
**Where:** `apps/frontend/src/routes/admin/managed-systems.test.tsx` (3 tests). Component exposes `archive-${slug}`, `save-${slug}`, `include-archived-checkbox` test ids (`apps/frontend/src/routes/admin/managed-systems.tsx:82,257,265`) but no test exercises them.
**Why it matters:** ADR-0017 archive cascade is the highest-risk admin path. The UI mutation path is wholly untested at the route level; only the create error envelope (line 130-154 of the test) is covered.
**Recommendation:** Add three tests: (a) toggle `include-archived-checkbox`, assert second GET sent with `?include_archived=true`. (b) click `archive-tableau`, assert POST `/managed-systems/ms-1/archive`, list invalidates, row disappears. (c) edit name + click save, assert PATCH body excludes unchanged fields.

### M5. Frontend AA admin: archive flow + grouped→flat→grouped transition untested
**Where:** `apps/frontend/src/routes/admin/analytics-areas.test.tsx` covers grouped list, filter switch, create error, and gate. No archive interaction. No test for clearing the filter back to grouped.
**Why it matters:** Same risk as M4 for AA. The MS picker in the filter (`filter-managed-system-picker`) is dumb-tested at the picker contract layer (`components-test-pickers.test.tsx:11-25`) but no test asserts that clearing the picker returns to grouped mode.
**Recommendation:** Add archive-AA happy path and a "select MS, then re-select placeholder" test that asserts `aa-grouped-list` returns.

### M6. GET `/managed-systems?slug=` filter has no test
**Where:** (missing test) — `managed-system-service.ts:497` honors `query.slug`; routes pass it through (`routes.ts:188`); `ADR-0017:22` explicitly names this resolution path: "Clients may resolve a UUID from a slug via `GET /managed-systems?slug=<slug>`".
**Why it matters:** ADR-quoted load-bearing read path. If the filter regresses to ignore the query param, callers that rely on slug→UUID resolution would silently receive the full list.
**Recommendation:** Create MS, GET `?slug=<that-slug>`, assert `total === 1` and `items[0].slug` matches. Negative: `?slug=nonexistent` returns `total === 0`.

### M7. Mutation rate-limit not exercised
**Where:** `apps/backend/src/server.ts:244-247,260,276` wires `app.rateLimitConfig.mutation` onto all three MS routes and three AA routes. No test asserts a 429 from a mutation tier.
**Why it matters:** ADR-0015:7-18 mutation tier. Slice 1 had a rate-limit purge test (`rate-limits-purge.integration.test.ts`) but Slice 2 ships the per-route binding with no behavioral coverage.
**Recommendation:** Tight-loop POST `/managed-systems` until 429, assert `code: 'rate_limited.actor'`. Acceptable to mark `.skip` with a configurable threshold for fast suites.

### M8. Audit-log `audit-events.ts` `analytics_area_archived` schema mismatch on cascade row payload
**Where:** `apps/backend/src/modules/analytics-areas/__tests__/analytics-area.integration.test.ts:289-292` asserts the standalone-archive detail is `{ analytics_area_id, cascade_source_managed_system_id: null }`. The cascade test (line 344-352) only asserts `cascade_source_managed_system_id` per row, not the full shape.
**Why it matters:** ADR-0017:96-102 locks the exact detail shape. If the cascade variant later adds or omits a field, only the standalone test would fail.
**Recommendation:** In the cascade test, change the per-row check to `expect(r.detail).toEqual({ analytics_area_id: expect.any(String), cascade_source_managed_system_id: msId })`.

## Low

### L1. F-010 shim happy-path is verified only transitively
**Where:** `role-grants.integration.test.ts:141-144` defers `partition=false` to "every `boss.start()` invokes pgboss.create_queue".
**Why it matters:** The boss boot integration test does run, so coverage exists — but a direct unit-call assertion would catch a future `EXECUTE` regression in seconds rather than via a 30-second boss boot.
**Recommendation:** Add a one-line `appHandle.pool.query("select pgboss.create_queue('__f010_test_ok__', '{}'::jsonb)")` and assert no rejection. (And then drop the queue in cleanup.)

### L2. `ADR-0017` slug-reuse-after-archive integration-tested at DB layer only
**Where:** `managed-systems.integration.test.ts:86-111` covers the partial-index behavior with raw SQL via `fops_migrate`. No test through the service that re-creates a slug after archiving the same one.
**Why it matters:** The service path could spuriously reject slug reuse if a future refactor checks `slug` independently of `archived_at`. ADR-0017:63 "Slug reuse after archive is permitted".
**Recommendation:** In `managed-system.integration.test.ts`, register slug, archive it, register again with same slug, assert 201.

### L3. AA list filter `managed_system_id` does not assert cross-MS rejection
**Where:** `analytics-area.integration.test.ts:365-399` asserts the count for ms1; no negative assertion that ms2's rows are absent.
**Why it matters:** Belt-and-suspenders for tenant isolation per ADR-0017.
**Recommendation:** Add `expect(onlyMs1.json().items.every(i => i.managed_system_id === ms1)).toBe(true)`.

### L4. `audit_log` historical reference: archived MS row remains FK-able
**Where:** (missing test) — `managed-systems.integration.test.ts:147-189` tests FK rejection for unknown MS but not the "archived MS still satisfies the FK" requirement.
**Why it matters:** ADR-0017:65 "`GET /analytics-areas/:id` returns archived rows by id, and historical records (VOC, Finding, Task, Survey) join through the UUID and render the archived row's `name` with an archived-state indicator." If a future migration adds `ON DELETE CASCADE` or filters FK by `archived_at IS NULL`, history breaks.
**Recommendation:** Create MS, archive it, insert a permission_grant referencing it via `fops_migrate`, assert insert succeeds.

### L5. `created_user_agent_summary='integration-test'` session cleanup is the only between-test isolation
**Where:** `managed-system.integration.test.ts:60-81` and `analytics-area.integration.test.ts:83-105`.
**Why it matters:** Tests sharing the dev Postgres rely on slug prefix `it-` and a UA marker to clean up. A test that forgets the prefix leaks rows into the next run — minor, but two pairs of suites already touch the same tables, so prefix collisions are likely as Slice 3 grows.
**Recommendation:** Add a `beforeAll` `truncate` for test-owned suffix patterns, or move to a dedicated test schema.

## Verified clean

- ADR-0008 audit-log INSERT-only for fops_app: `role-grants.integration.test.ts:42-71` covers INSERT/UPDATE/DELETE matrix.
- ADR-0018 default-owner XOR at DB layer: `managed-systems.integration.test.ts:43-57` plus accepting-cases at line 59-84.
- ADR-0017 partial unique indexes (MS + AA + teams): `migration.test.ts:159-169` and `managed-systems.integration.test.ts:86-145`.
- ADR-0017 slug immutability (MS + AA + managed_system_id): `managed-system.integration.test.ts:199-220` + `analytics-area.integration.test.ts:188-225`.
- ADR-0017 cascade audit detail shape (`cascaded_analytics_area_ids[]`, `cascade_source_managed_system_id`): `analytics-area.integration.test.ts:308-362`.
- ADR-0017 archive idempotency (re-archive is a no-op, no second audit row): `managed-system.integration.test.ts:273-303` + `analytics-area.integration.test.ts:294-305`.
- ADR-0009 graceful shutdown ordering (boss.stop before app.close): `boot.integration.test.ts:95-131`.
- ADR-0009 pg-boss schema install grants: `migration.test.ts:97-119`.
- F-010 EXECUTE revocation on `_create_queue_unsafe`: `role-grants.integration.test.ts:112-120` + `migration.test.ts:186-215`.
- ADR-0015 workspace-first index convention: `role-grants.integration.test.ts:170-213`.
- Permission FK targets to MS for grants/denies/requests: `managed-systems.integration.test.ts:157-188`.

---

5-line summary:
1. Cascade atomicity (C4), tenant isolation (C1), and idempotency-mismatch (C2) — three ADR-load-bearing branches — have zero coverage; a regression in any of them passes the current 157-test suite green.
2. F-010 shim test (C3) pins the literal payload only; lower/upper-case and string/numeric `partition` variants are unverified bypass surfaces.
3. Negative-mutation paths (H1, H5) assert HTTP code only — neither row count nor audit_log absence is checked, so a "deny after audit-write" inversion would not fail.
4. Frontend admin write tests cover create-error envelopes; archive UI, include-archived toggle, edit-save, and AA archive/clear-filter flows (M4, M5) are wholly absent.
5. Migration count assertion (H7) and AA-under-archived-MS semantics (H2) are tomorrow's flaky-test and silent-bug bombs — fix before Slice 3 land.
