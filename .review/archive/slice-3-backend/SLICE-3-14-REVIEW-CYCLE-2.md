# Slice 3 #14 — Adversarial Review Cycle 2

## Summary

Cycle 1's 14 fix commits closed F1–F20 cleanly at the unit / module level. Cycle-2 sweep found **two real bugs that the fixes either introduced or failed to surface** (one P0 test-suite-breaker, one P1 missed permission/owner edge case), plus **two operational findings cycle 1 did not exercise** (one P1 info-leak via stale_write ordering, one P2 hash-semantic shift). Type-check is clean; no regressions in unrelated modules; `requestable_permission` hoist is correctly scoped (only one producer exists in the tree). Posture: **two P0/P1 issues block merge; everything else can land as follow-ups.**

## Findings

### P0 — Blocking

- **[C1] `cleanupAuditLog` scope (F11 fix) runs AFTER `cleanupProductTables` deletes the parent rows it joins through — audit log is now never cleaned, and the next `cleanupProductTables` will FK-violate on actor delete**
  - File: `apps/backend/src/modules/voc/__tests__/patch-voc.integration.test.ts:321-324` (`beforeEach`) and `:314-319` (`afterAll`)
  - What: Order in `beforeEach` is `cleanupProductTables()` then `cleanupAuditLog()`. `cleanupProductTables` (lines 239-251) deletes `voc.vocs` and `core.managed_systems` matching `slug like 'it-patch-%'`. The scoped `cleanupAuditLog` (lines 272-293) then runs `delete from core.audit_log where ... subject_id in (select id from voc.vocs where primary_managed_system_id in (select id from core.managed_systems where slug like 'it-patch-%'))` — but those rows no longer exist, so the subquery returns empty and **no audit rows are deleted**.
  - Compounding: `cleanupProductTables` also deletes `mock-dev-%` actors (line 253-256). `core.audit_log.actor_id` has `FK ... REFERENCES actors(id)` with no CASCADE (default RESTRICT — `db/schema/core.ts:122-124`). Test 16 (revoked-grant) writes a `voc_severity_set` row whose `actor_id` is the dev actor. On the next `beforeEach`, the actor delete will raise `update or delete on table "actors" violates foreign key constraint` and abort the run (or silently leave actors orphaned, depending on Postgres txn boundary).
  - Cycle 1 effect: F11 changed the cleanup from "wipe all VOC audit rows globally" to "scope by subject_id" but the ordering against `cleanupProductTables` was not revisited. The previous global wipe ran fine in this order; the scoped version is order-dependent.
  - Why P0: blocks the test suite from being re-runnable; CI-flake on the second run; audit table grows unboundedly across runs.
  - Fix: invert the order — call `cleanupAuditLog()` BEFORE `cleanupProductTables()` in both `beforeEach` and `afterAll`. Alternatively, scope by predicate that survives the delete (e.g., add a `test_run_id` tag, or scope by `actor_id like 'mock-dev-%' or actor_id = adminActorId` — but the simplest fix is order-flip). Add a regression assertion in `afterAll`: `select count(*) from core.audit_log where event_type in (...test events...) and subject_id not in (select id from voc.vocs)` → expect 0.

### P1 — Should fix before merge

- **[C2] Owner-mutex bypass: patching one owner field on a row whose OTHER owner is already non-null trips the DB CHECK constraint and surfaces as 500**
  - File: `apps/backend/src/modules/voc/service.ts:271-275` (standard mutex), `:318` (postpone mutex), and `packages/shared/src/vocs/patch-request.ts:58-64` (zod refine)
  - What: Zod refine and service mutex both check `input.owner_user_id != null && input.owner_team_id != null` — i.e., only fire when **both** are present in the patch payload. But the service resolves `newOwnerUser`/`newOwnerTeam` from `input ?? row` (lines 434-435 and 316-317 in postpone). If the row already has `owner_user_id: A, owner_team_id: null` and the client sends `{ owner_team_id: B }` (no `owner_user_id`), zod refine passes (only one input owner), service mutex passes (only one input owner), then the UPDATE writes `owner_user_id: A, owner_team_id: B` → `vocs_owner_user_id_team_id_xor_check` (`migrations/0010_slice3_voc_foundation.sql:84`) violation → raw PG exception → 500.
  - Why P1: a legitimate "I want to reassign to a team without first clearing the user" UX flow crashes the API. There is no integration test covering "row owner=user, patch owner=team only".
  - Fix: the mutex check in service must operate on the **resolved** values, not the input. In `service.ts`, after computing `newOwnerUser` / `newOwnerTeam` (lines 434-435, mirror at 316-317), add: `if (newOwnerUser != null && newOwnerTeam != null) throw new HttpError('validation.failed', 'cannot have both owner_user_id and owner_team_id; clear the existing owner in the same PATCH', { fields: [{ path: ['owner_team_id'], code: 'invalid' }] });`. Add an integration test: seed VOC with `owner_user_id`, PATCH `{ owner_team_id }` → 422 validation.failed (NOT 500).

- **[C3] Permission re-check fires AFTER `conflict.stale_write`, leaking `current_updated_at` of any in-workspace VOC to actors who lack `voc.triage`**
  - File: `apps/backend/src/modules/voc/service.ts:199-204` vs `:215-247`
  - What: ordering inside `updateVoc` is: (1) select FOR UPDATE → 404 if missing; (2) **If-Match mismatch → 409 stale_write with `current_updated_at`**; (3) MS lock + archive check; (4) **permission re-check**. A developer with no `voc.triage` grant who sends a PATCH with a bogus `If-Match` against any in-workspace VOC receives `body.detail.current_updated_at` — leaking the live `updated_at` of records they cannot otherwise read mutate.
  - Cycle 1 noted this in the operational-concerns section as a question but did not flag it; the fix in F1 (discriminate `permission.denied` vs `permission.scope_required`) made the post-leak deny message more specific without addressing the pre-leak.
  - Severity: P1 for security/privacy. In practice `updated_at` rarely encodes secrets, but it does enable activity-frequency probing on any VOC ("who is being triaged hourly vs. weekly"). ADR-0019 §D wants the permission check to be authoritative; failing fast on stale_write before authorisation is a subtle ordering bug.
  - Fix: move the permission re-check to fire **before** the If-Match comparison. Reorder lines 215-247 to run immediately after the MS archive check at line 209-213 — actually best position is right after the VOC FOR UPDATE select (line 195) and before the stale_write check at line 200. The MS lock can stay where it is; the permission check only needs the VOC's `primaryManagedSystemId`, which is already on `row`. Update test 3 (`patch-voc.integration.test.ts:416-443`) to also assert that a dev actor without grant + bogus If-Match returns 403 (not 409). Add a dedicated test: "developer without grant + stale If-Match → 403, not 409, and response has no current_updated_at".

### P2 — Nice to fix

- **[C4] F6 ifMatch-in-hash silently re-classifies "client retried after refetch with new If-Match + same intent" from cache-hit (200) to `conflict.idempotency_key_reuse` (409)**
  - File: `apps/backend/src/modules/voc/routes.ts:182-186`
  - What: cycle-1 F6 fix changed the idempotency hash from `{vocId, ...rawBody}` to `{vocId, ifMatch, ...rawBody}`. Semantic shift: a client that retries with a fresh `If-Match` (e.g., after a transient network failure that prompts a refetch + retry of the same intent) now hashes differently → mismatch → 409 `conflict.idempotency_key_reuse`. Cycle 1 framed this as P2 "should be intentional"; the implementer adopted it without a spec line confirming. ADR-0015 treats Idempotency-Key as "same key + same hash → replay; same key + different hash → 409". Whether `If-Match` is "part of the body" is undefined.
  - Effect: a well-behaved retry-on-refetch client gets a 409 it cannot easily distinguish from "you reused the key for a genuinely different intent". The fix is silent (no operator-visible log, no client-facing hint).
  - Fix options:
    1. Revert F6 and accept the cycle-1-flagged anomaly that retry-after-refetch replays the cached body silently (probably wrong — cached body has stale `updated_at`).
    2. Keep F6 but emit a distinct error code or detail field when the hash mismatch is attributable to If-Match-only change: `409 conflict.idempotency_key_reuse` with `detail: { hint: 'if_match_changed', advice: 'generate a fresh idempotency key for the new If-Match' }`. Requires a separate hash for body-only.
    3. Document the choice in the route handler and accept the 409 (current state plus a contract doc).
  - Recommend option 3 for now, with a comment block in `routes.ts:182-186` explicitly calling out the semantic shift and an issue filed for option 2 if a real client trips on this.

- **[C5] `triage_state_review_postponed_at` is never reset when a postponed VOC subsequently triages, leaving a misleading historical timestamp on the row**
  - File: `apps/backend/src/modules/voc/service.ts:447-450` (standard `triageState` patch) and the envelope omits the field entirely
  - What: `postpone_review: true` sets `triage_state_review_postponed_at = NOW()`. A subsequent PATCH with `triage_state: 'triaged'` does NOT touch the column. The row ends up `{ triage_state: 'triaged', triage_state_review_postponed_at: '2026-05-18T10:00:00Z' }` — semantically inconsistent (the postpone was resolved by the triage). Downstream readers (BI, audit reconstruction) may interpret the timestamp as "currently postponed".
  - Why P2: not on the spec ACs; no current consumer reads the column from the wire (envelope omits it). But future consumers will be confused.
  - Fix: in the standard diff path when `triageStateChanged` and `newTriageState !== 'untriaged'`, set `triageStateReviewPostponedAt: null` in the patch. Or document the historical-timestamp interpretation in a column comment. The first option is cleaner.

- **[C6] Test 18 (concurrent Promise.all) sorts statuses without asserting the winning request's body shape**
  - File: `apps/backend/src/modules/voc/__tests__/patch-voc.integration.test.ts:1073-1082`
  - What: F4 fix correctly fires both PATCHes via `Promise.all` and asserts `[200, 409]`. But the test only inspects the loser (asserts code = `conflict.stale_write`). It doesn't assert the winner's body has the expected severity (one of 'low' or 'medium') — so a regression where the winning PATCH wrote nothing would pass.
  - Fix: `const winner = res1.statusCode === 200 ? res1 : res2; expect(['low', 'medium']).toContain(winner.json().severity); expect(winner.json().updated_at).not.toBe(sharedIfMatch);`. Also assert one and only one `voc_severity_set` audit row.

- **[C7] `voc_severity_set` schema's `from === to` refine never tested at the audit-service layer for `(null, null)` from the service**
  - File: `packages/shared/src/audit/voc.ts:60-66` and `service.ts:477-487`
  - What: F2 widened the schema to `nullable on to`; the unit test (`voc-audit-schemas.test.ts:118-127`) verifies `(null, null)` is rejected at the schema level. The service's `severityChanged` guard prevents the no-op from reaching the audit service. But: if the service guard ever drifts (e.g., a future refactor that compares severity via different normalisation), the audit-service will surface a Zod error inside the tx → 500. Currently there's no e2e test that PATCHing `{ severity: null }` on a row whose severity is already null is treated as no-op (returns 200 with no audit row, not 500).
  - Fix: add a test: seed VOC severity null (default), PATCH `{ severity: null }` → 200, audit row count = unchanged (no `voc_severity_set` emitted). One-liner addition to the empty-diff test family.

### P3 — Future work / out of scope for #14

- **[C8] F16 (60/min triage rate limit) is correctly deferred per cycle-1 recommendation, TODO at `routes.ts:144` is in place. No action needed but confirming orchestrator is aware of the open follow-up.**

- **[C9] `composeEnvelope` deliberately omits `triage_state_review_postponed_at` from the wire envelope** — UI cannot display "postponed since X" without an extra round-trip. Probably acceptable for #14 but flag for the FE issue (#18) which will need this for the inbox row state.

- **[C10] The route's pre-zod forbidden-field strip is case-sensitive (`'cluster_decision' in rawBody`)** — cycle-1 F15 was about `.strict()` zod and is now landed. A client sending `Cluster_Decision` slips past the forbidden-field check but is then rejected by `.strict()` as `unrecognized_keys` → `validation.failed` (generic) instead of the precise `validation.unexpected_field` per-field error. Acceptable — fuzzy casing is a client bug, not a spec contract — but worth a sentence in the route file documenting this fallback path.

- **[C11] `permission.denied` envelope now carries `detail.reason: 'grant_revoked' | 'grant_expired' | 'explicit_deny'`** (`service.ts:243-246`). This is the F1 fix landing point. A non-admin observer of error responses can now distinguish "I once had access and you took it" from "I never had access". Operationally acceptable (FE shows the reason anyway), but flag for any future PII review — the discriminator leaks the existence of revocation/expiry events the actor may not otherwise know about.

## What I checked but found clean (regressions specifically targeted)

- **F3 hoist scope**: grep across `apps/` + `packages/` confirms only `service.ts:233` puts `requestable_permission` in detail. Hoist logic at `server.ts:223-227` is correctly narrow (`'requestable_permission' in errDetail`). No false-positive hoist for unrelated endpoints. (See grep result above.)
- **F2 schema widening**: only one consumer (`audit-events.ts:153` registry). Old DB rows with `to: <severity>` (non-null) still validate fine — the widening is purely additive (`severitySchema → severitySchema.nullable()`).
- **F1 reason discrimination**: `permission.denied` is also thrown by AA and MS services (`analytics-area-service.ts:124`, `managed-system-service.ts:133`) without `detail.reason` — the new VOC variant adds `detail.reason` but doesn't break existing consumers since those throw with `undefined` detail. No state-mapper tests broke (state-mapper at `permissions/state-mapper.ts:44` discriminates on `Decision.reason`, not the HTTP envelope).
- **F15 .strict()**: pre-zod forbidden-field strip runs first and short-circuits; double-rejection cannot occur (the strip uses `return`, not fallthrough). All existing PATCH tests send schema-valid bodies; no test sends a forward-compat field that would now break.
- **F6 hash including ifMatch**: test 19 happens to use the same If-Match on both calls (`afterPatch1` for first PATCH, then reuses `voc.updated_at` — wait, let me re-check; the test re-uses `voc.updated_at` for both replays at line 1099 + 1102 — same ifMatch, same hash, cache replay works). Confirmed.
- **F11 cleanupAuditLog SQL itself**: the join via `voc.vocs + core.managed_systems` correctly identifies the test subjects when those rows still exist. Bug is purely ordering (see C1).
- **F4 Promise.all concurrency**: both `app.inject` calls fire concurrently; one wins the FOR UPDATE lock; the second blocks until first commits then reads the new `updated_at` and 409s on If-Match. Real lock exercise (would fail if `for update` were removed: the second PATCH would still read the original `updated_at` snapshot under READ COMMITTED, so the If-Match check would PASS, both would UPDATE, the loser's UPDATE would silently overwrite without 409 — F4 is therefore a meaningful regression sentinel).
- **Idempotency cache contents**: response bodies cached include `permission_decisions: {}` and `next_reporter_states` (workspace transition matrix). Nothing actor-sensitive. Cache write happens AFTER successful service (route lines 215-217); errors throw out of the tx, so failure responses are NOT cached — `idempotency-service.ts:58-88` is `record`-on-success only.
- **MS-archive vs PATCH race**: both take `for update` on the MS row; whichever commits first wins. If MS-archive wins, PATCH sees `archived_at !== null` → 409 conflict.parent_archived. If PATCH wins, MS-archive blocks until PATCH commits, then proceeds to archive. Result: archived MS with one trailing successful PATCH — semantically acceptable per spec.
- **Empty-diff path**: F5 fix now asserts `updated_at` equality + envelope toMatchObject (lines 1037-1042). Adequate.
- **Type safety**: `pnpm -F @fops/backend typecheck` passes; F12 (RoleLevel typing) propagated cleanly to `service.ts:186`.
- **Audit ordering under postpone+multi**: F13 test asserts `[voc_triage_postponed, voc_severity_set, voc_owner_assigned, voc_analytics_area_linked]` deterministically. Code at `service.ts:343-388` matches.
- **F20 detail snapshot**: test asserts `voc_triage_committed.detail.severity` reflects POST-UPDATE state. Code reads from `updated.severity`. Verified.
- **`voc_triage_committed` only on `untriaged → triaged`** (F19): test 4 (severity retriage) confirms only one `voc_triage_committed` fires across two PATCHes. Comment documents the decision.
- **Postpone-on-already-triaged guard** (F7): test 10b covers; impl at `service.ts:290-296` matches.
- **F18**: schema-level rejection of `from === to` for both `(high, high)` and `(null, null)` covered (`voc-audit-schemas.test.ts:108-127`).

## Open questions for orchestrator

1. **C1 (P0)**: Confirm fix is "flip `cleanupAuditLog` to run BEFORE `cleanupProductTables`" (simplest, preserves F11 intent). Implementer should also add a one-liner regression assertion in `afterAll` to catch future re-introductions. **Recommend approve the flip + assertion.**
2. **C2 (P1)**: Confirm the resolved-value mutex fix is the right semantic. Two alternatives: (a) require client to send both `owner_user_id: null` + `owner_team_id: B` to reassign (current behaviour if we just fix the 500), or (b) auto-clear the other owner when one is provided. **Recommend (a) — explicit is safer; matches existing zod refine pattern. Add the test.**
3. **C3 (P1)**: Reorder permission check to fire BEFORE stale_write. Test 3 needs amending (currently uses admin actor so still 409). Add a dedicated dev-no-grant + bogus-If-Match test asserting 403. **Recommend approve the reorder.** Any objection on perf grounds (extra permission lookup before a cheap header compare)? The permission lookup is bounded by 2 SELECTs on indexed tables — negligible compared to the FOR UPDATE on VOC.
4. **C4 (P2)**: Document F6 hash change as a known contract subtlety (option 3) or open a follow-up issue to introduce a distinct `if_match_changed` hint (option 2)? **Recommend option 3 + comment now, defer option 2 until a real client trips.**
5. **C5 (P2)**: Reset `triage_state_review_postponed_at` to null on subsequent triage? **Recommend yes — single-line patch in `service.ts` triage branch, prevents downstream confusion.**
6. **C6 / C7 (P2)**: Test improvements only — fold into the same cycle-2 fix commit. No orchestrator decision needed.
