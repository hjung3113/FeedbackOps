# Slice 3 #14 — Adversarial Review Cycle 1

## Summary

PATCH `/vocs/:id` is **near-shippable with meaningful gaps**. The transactional shape is correct (FOR UPDATE on VOC + parent MS inside one tx, idempotency advisory-lock mirrors POST, permission re-check honours the tx). Spec compliance for happy-path / forbidden-fields / postpone / If-Match / idempotency is covered by tests 1–20.

However: (a) severity-clear (`severity: null` de-triage) is **silently dropped from the audit log** — both in the standard and postpone paths; (b) the `permission.scope_required` envelope nests `requestable_permission` under `detail` instead of the top-level position defined by `ErrorEnvelope`, locking a new convention that contradicts ADR-0012; (c) the concurrency claim ("SELECT FOR UPDATE verified") is **not actually exercised** by test 18 (sequential awaits); (d) the empty-diff path doesn't assert envelope byte-identity; (e) a non-MS-scoped Developer scope_required currently leaks via `decision.reason !== allow` rather than discriminating between `no_grant`, `grant_revoked`, `grant_expired` — every denial collapses to `scope_required` with a `requestable_permission` regardless of whether a request is even possible.

Posture: **minor gaps blocking merge — one P0, four P1, several P2/P3.**

## Findings (prioritized)

### P0 — Blocking

- **[F1] `permission.scope_required` returned for every denial reason, including explicit deny and revocation**
  - File: `apps/backend/src/modules/voc/service.ts:215-234`
  - What: The service treats any `decision.allow !== true` as `permission.scope_required` and unconditionally includes `requestable_permission`. But `checkCapability` can return `reason: 'explicit_deny'` (cannot be requested), `'grant_revoked'`, `'grant_expired'`, `'no_grant'`. ADR-0012 / ErrorEnvelope semantics: `permission.denied` is the generic deny; `permission.scope_required` is specifically the case where the actor *may request* MS scope. An explicit deny should be `permission.denied` with no `requestable_permission` (spec §"Non-MS-scope Developer → 403 permission.scope_required" applies only to that one denial reason).
  - Why it matters: A denied actor whose grant was just revoked sees a "request access" button that opens a request flow which permission-policy.md likely rejects; an actor with an explicit deny gets misled into requesting a capability they can never have. Also breaks audit/state-mapper attribution (state mapper discriminates on `Decision.reason`).
  - Fix: Branch on `decision.reason` in `service.ts:221-234`. If `decision.reason === 'explicit_deny'` → throw `permission.denied`. If `'grant_revoked'` / `'grant_expired'` → also `permission.denied` (with reason in detail, no `requestable_permission`). Only `'no_grant'` (and `developer` role missing the MS-scoped grant) maps to `permission.scope_required` with `requiredScope: [msId]`. Update test 16 to assert the revoke case returns either `permission.denied` (if you take this branch) or to assert the reason discriminator.

### P1 — Should fix before merge

- **[F2] Severity-clear (`severity: null`) silently drops the audit row in BOTH paths**
  - File: `apps/backend/src/modules/voc/service.ts:324-333` (postpone path) and `service.ts:446-457` (standard path)
  - What: `if (severityChanged && newSev !== null)` — when the new severity is `null` the UPDATE writes the column but no audit row is emitted. The TODO comment at line 446 acknowledges this. Root cause: `vocSeveritySetDetailSchema` (`packages/shared/src/audit/voc.ts:57-64`) declares `to: severitySchema` (non-nullable). Spec ACs explicitly allow non-NULL → NULL ("de-triage path") and PATCH schema accepts `severity: null`.
  - Why it matters: ADR-0008 demands an audit row for every state change. A clearing of severity is a state change; losing it defeats audit completeness and breaks any BI/back-fill that reconciles VOC current state from the event stream.
  - Fix (one of two options):
    1. Widen `vocSeveritySetDetailSchema.to` to `severitySchema.nullable()` and tighten the refine to `d.from !== d.to`. Remove the `&& newSev !== null` guards in `service.ts:324` and `service.ts:447`. Add an integration test: `severity: null` on a row with `severity: 'high'` → 200, one `voc_severity_set` row with `from: 'high', to: null`.
    2. Introduce a sibling `voc_severity_cleared` event (`{ voc_id, from }`) — more work, but if "de-triage" carries different downstream semantics it deserves its own verb.
  - Recommend option 1.

- **[F3] `permission.scope_required` envelope shape contradicts `ErrorEnvelope` interface**
  - File: `apps/backend/src/modules/voc/service.ts:222-233` and `packages/shared/src/errors/codes.ts:63-72`
  - What: `ErrorEnvelope` declares `requestable_permission?` as a **top-level** property. The service throws `HttpError(..., { requiredScope, requestable_permission })`, and the Fastify error handler at `server.ts:217-221` serialises that whole object as `detail`. Result on the wire: `{ code, message, detail: { requiredScope, requestable_permission } }` — the test at `patch-voc.integration.test.ts:775` asserts on `body.detail.requestable_permission`, locking in the contract violation.
  - Why it matters: Frontend `<PermissionBlockedPanel state="request_access">` reads from `requestable_permission` per the ErrorEnvelope contract; if the FE was implemented from the typed envelope it would look for `body.requestable_permission`, not `body.detail.requestable_permission`. Also blocks any future ADR-0012 generator from validating envelopes.
  - Fix: Either (a) update the Fastify error handler in `server.ts:207-240` to recognise `detail.requestable_permission` / `detail.requiredScope` and hoist them to top-level when present; or (b) change `HttpError`'s shape to accept a typed `{ detail, requestable_permission }` and render them at the correct positions. Update the test to assert `body.requestable_permission.permission` and `body.detail.requiredScope` (or wherever the canonical position lands). Open a one-line ADR-0012 amendment if `requiredScope` is to live inside `detail` rather than top-level (spec §Errors says "body carries `requiredScope: string[]` + `requestable_permission`" without specifying position).

- **[F4] Concurrency test (test 18) does not actually exercise SELECT FOR UPDATE**
  - File: `apps/backend/src/modules/voc/__tests__/patch-voc.integration.test.ts:852-886`
  - What: The two `await app.inject(...)` calls are sequential — the second only fires after the first returns. The 409 in `res2` is caused exclusively by the `If-Match` check, not by `SELECT FOR UPDATE` lock contention. The comment at line 853 admits "sequential simulation" but the spec AC says "SELECT FOR UPDATE on VOC row verified by concurrent-PATCH integration test (two txns race; second receives stale_write)" — the lock is not verified.
  - Why it matters: If someone removes the `for update` clause from `selectVocForUpdate` (`repo.ts:135`), this test still passes. The optimistic-concurrency guarantee silently becomes If-Match-only.
  - Fix: Fire both PATCHes without `await` (use `Promise.all([patchVoc(...), patchVoc(...)])`). One will win the row lock, the other will queue, and once the first commits the second will see the new `updated_at` and return 409. Alternatively: open a tx via the raw `dbHandle.pool`, `SELECT … FOR UPDATE` the VOC row outside Fastify, then call PATCH inside a 100 ms `setTimeout` and assert PATCH blocks/eventually returns 409. The `Promise.all` version is simpler and adequate.

- **[F5] Empty-diff test does not assert envelope byte-identity / updated_at stability**
  - File: `apps/backend/src/modules/voc/__tests__/patch-voc.integration.test.ts:822-850`
  - What: Spec §8.4 step 6: "empty diff returns 200 OK with unchanged envelope and no audit row". Test only checks status + audit-row count delta. Does not assert `body.updated_at === voc.updated_at` or that any other field is unchanged.
  - Why it matters: A future change that always touches `updated_at = NOW()` regardless of diff would pass the test but break the contract. Also note `service.ts:425-428`: the empty-diff branch returns `composeEnvelope(row, nextStates)` where `row.updatedAt` is the original — but if a later refactor moved the UPDATE before the diff check, this property silently breaks.
  - Fix: Add `expect(res.json().updated_at).toBe(voc.updated_at)` and `expect(res.json()).toMatchObject({ id: voc.id, severity: null, triage_state: 'untriaged', ... })` with the full envelope.

### P2 — Nice to fix

- **[F6] Idempotency hash does not include `If-Match`; replay can mask stale-write**
  - File: `apps/backend/src/modules/voc/routes.ts:182`
  - What: `hashRequestBody({ vocId, ...rawBody })`. Two PATCHes with the same body + same key but different `If-Match` headers (e.g., client retried after a refetch) will both hit the cache and replay the original 200 — even if the second request would otherwise stale-write. This is technically ADR-0015-compliant (same key + same body → cached), but operationally surprising.
  - Why it matters: A retry after an intervening server-side change is silently swallowed; the client thinks its second intent landed when in fact the cached body is from a stale tx.
  - Fix: Include `ifMatch` in the hash: `hashRequestBody({ vocId, ifMatch, ...rawBody })`. Update test 19 to use the same `If-Match` for both attempts (already the case). Document the choice in `routes.ts` next to the hash call.

- **[F7] `postpone_review: true` is permitted on rows where `triage_state !== 'untriaged'`**
  - File: `apps/backend/src/modules/voc/service.ts:272-310`
  - What: Spec semantics: 보류 is "postpone a pending triage decision". The service does not guard against `row.triageState === 'triaged'` (or `dismissed_not_actionable`) — the postpone path will happily set `triage_state_review_postponed_at = NOW()` on a row that's already triaged. The spec doesn't explicitly forbid this in the AC list, but the field name (`triage_state_review_postponed_at`) and the postpone semantic make this nonsensical for already-triaged rows.
  - Why it matters: Allows audit-log noise (`voc_triage_postponed` rows on triaged VOCs) and contradicts the spec's intent that postpone is an *alternative* to triaging.
  - Fix: Add a guard at `service.ts:272`: `if (input.postpone_review === true && row.triageState !== 'untriaged') throw new HttpError('validation.failed', 'postpone_review only applies to untriaged VOCs', { fields: [{ path: ['postpone_review'], code: 'invalid_state' }] })`. Add a test. If you decide this is fine, document the decision in a comment.

- **[F8] Test 19 does not prove "exactly one UPDATE happened"**
  - File: `apps/backend/src/modules/voc/__tests__/patch-voc.integration.test.ts:889-917`
  - What: The test asserts `res1.json() === res2.json()` and counts `voc_severity_set` audit rows. But the cached-replay path returns the **stored body** — that body would be byte-identical even if the second request triggered a second real UPDATE (since the idempotency-cache write happens AFTER the UPDATE). The audit-row count check is the only real evidence. A stronger assertion would be on `updated_at` stability or on `voc.vocs.updated_at` in DB.
  - Why it matters: If a future refactor removes the idempotency lookup but keeps the cache write, this test still passes (one row inserted, one cached body returned, two real UPDATEs — both audit rows emitted, but the second UPDATE is by the second handler which sees the cached lookup result... actually this would fail. OK, the count check is sufficient.) Still, asserting on `updated_at` is more direct evidence.
  - Fix: Add `expect(res1.json().updated_at).toBe(res2.json().updated_at)` (already implicit in `toEqual`, but make it explicit). Optionally query `voc.vocs.updated_at` and assert it changed only once vs. the original.

- **[F9] AA cross-MS test does not differentiate service-level error from DB-trigger error**
  - File: `apps/backend/src/modules/voc/__tests__/patch-voc.integration.test.ts:656-688`
  - What: Spec §8.4 AC: "the service surfaces the field-level hint **before** the trigger fires". The test asserts the field-level hint is present but doesn't verify the trigger didn't fire. Confirmed by code review: `service.ts:244-247` does throw before any UPDATE that would invoke the trigger. The test is adequate but the assertion doesn't prove the service-level check is what ran (could be a trigger error formatted to look similar).
  - Why it matters: Low — the code path is clearly the service-level guard. But spec wants this explicit.
  - Fix: Either accept (annotate the test comment to explain) or add a second test that drops the AA cross-MS service check (mock) and asserts the trigger surfaces a different error shape; not worth the test complexity. Annotate with a comment is sufficient.

- **[F10] Test 16 (revocation race) cookie was issued BEFORE the revoke; doesn't fully prove tx-level recheck**
  - File: `apps/backend/src/modules/voc/__tests__/patch-voc.integration.test.ts:780-819`
  - What: The session cookie carries `role_level` (a snapshot), not the grant set. The grant check happens at tx time via `checkService.checkCapability(..., { tx })`. The test correctly exercises this: first PATCH succeeds, grant is revoked, second PATCH fails. But the test doesn't prove the check used `tx` (vs. the pool with a stale snapshot). To prove tx-binding, you'd need a scenario where the revoke happens inside the same transaction. That's hard to construct from a test harness.
  - Why it matters: ADR-0019 §D requires `tx` binding. Code reads `service.ts:219` — passes `{ tx }`. Test gives evidence the read sees the revoke, which transitively requires `tx`-binding because a pool-bound read in the second handler would still see committed-revoke. So the test does prove the ADR-0019 §D requirement — just not directly. Acceptable.
  - Fix: Add a comment to the test explaining the chain of inference. Optional: add a second-tier test using a `BEGIN; UPDATE permission_grants SET revoked_at = NOW() ... COMMIT;` between the SELECT in handler and the UPDATE, but that requires test-harness instrumentation.

- **[F11] `cleanupAuditLog` wipes audit rows globally; races with parallel test files**
  - File: `apps/backend/src/modules/voc/__tests__/patch-voc.integration.test.ts:248-264`
  - What: `delete from core.audit_log where event_type in (...)` deletes ALL VOC/MS audit rows in the database, not scoped by workspace or subject_id. If two test suites run against the same DB (vitest default = single fork, but pool/threads modes share DB), they'll wipe each other's data.
  - Fix: Scope by `subject_id` (test fixtures already track VOC ids) or by `actor_id IN (test actor ids)`. Or run integration tests with `--no-file-parallelism`.

- **[F12] `actor.role_level: string` is untyped where `RoleLevel` already exists**
  - File: `apps/backend/src/modules/voc/service.ts:185`
  - What: `actor: { actor_id: string; workspace_id: string; role_level: string }` — `RoleLevel` is exported from `apps/backend/src/modules/auth/session-service.ts:19` (`'admin' | 'developer' | 'user'`). Using `string` lets typos and invalid roles through.
  - Fix: Import `RoleLevel` and type the field: `role_level: RoleLevel`. Routes already get it from `sess.role_level` which is `RoleLevel`-typed at the source.

- **[F13] No integration test covers postpone + additional field changes (severity/owner/AA combined with postpone_review:true)**
  - File: `apps/backend/src/modules/voc/__tests__/patch-voc.integration.test.ts` (no test) and exercised code at `service.ts:288-310`
  - What: The postpone branch in `updateVoc` has special-cased logic to apply severity/owner/AA changes alongside `postpone_review: true`. The audit ordering (`voc_triage_postponed` first, then `voc_severity_set` / `voc_owner_assigned` / `voc_analytics_area_linked`) is intentional but untested.
  - Fix: Add a test: `{ postpone_review: true, severity: 'high', owner_user_id: <admin>, analytics_area_id: <aa> }` → 200, audit rows in the order `[voc_triage_postponed, voc_severity_set, voc_owner_assigned, voc_analytics_area_linked]`.

- **[F14] Postpone path is unconditional UPDATE; replaying `{ postpone_review: true }` on already-postponed VOC emits a new audit row + bumps `updated_at` every call**
  - File: `apps/backend/src/modules/voc/service.ts:304-322`
  - What: No empty-diff short-circuit on the postpone path. Each call writes `triage_state_review_postponed_at = NOW()`, bumps `updated_at`, emits `voc_triage_postponed`. If client clicks "보류" twice in a row, two audit rows.
  - Why it matters: Probably intended (each postponement IS an event), but worth flagging because the standard path treats no-op as no-write.
  - Fix: Either document the asymmetry in a comment, or short-circuit when `row.triageStateReviewPostponedAt !== null && no other changes` → return current envelope.

- **[F15] Validation: forbidden-field check at route is case-sensitive; client sending `Reporter_Facing_Status` would slip through Zod's strip and never trigger the dedicated error**
  - File: `apps/backend/src/modules/voc/routes.ts:163-171`
  - What: `if (f in rawBody)` is case-sensitive. JSON keys are case-sensitive per spec, so this is technically correct. But a fuzzy client sending wrong casing gets a silent strip (Zod's default `.object()` strips unknowns per `patch-request.test.ts:105-111`) and the request silently succeeds with no triage_state change.
  - Why it matters: Low. Not a security or correctness bug, but the silent-strip is footgun-y.
  - Fix: Consider `.strict()` mode on the Zod schema in `packages/shared/src/vocs/patch-request.ts:45`, so unknown keys throw `unrecognized_keys` → `validation.failed`. Tests need updating.

### P3 — Future work / out of scope for #14

- **[F16] Rate-limit bucket "mutation" is shared at `max: 10/min`; spec §"Rate limiting" calls for 60/min on PATCH /vocs/:id**
  - File: `apps/backend/src/server.ts:191-204` and `routes.ts:148`
  - What: The shared `app.rateLimitConfig.mutation` is 10/min. Spec is 60/min for the triage burst. Currently PATCH is on the 10/min bucket.
  - Why it matters: Triage commit + undo + retriage burst could hit the bucket fast (4 PATCHes per VOC × 3 VOCs in 60s = 12 > 10).
  - Fix (future): Introduce a third bucket `triage` with `max: 60` and pass it to `vocRoutes`. Not blocking — flag for a follow-up issue.

- **[F17] `requiredScope: [msId]` is single-element; future multi-MS scopes will require array semantics**
  - File: `apps/backend/src/modules/voc/service.ts:226`
  - What: Brief noted "detail.requiredScope is an array per spec". Current impl always emits a single-element array. Frontend should be tolerant; future grants spanning multiple MSes would populate this list.
  - Fix: None now. Documented future.

- **[F18] `voc_severity_set` audit schema: `from === to` is rejected (line 63), service correctly guards, but no test exercises the rejection at the audit-service layer**
  - File: `packages/shared/src/audit/voc.ts:57-64` and `packages/shared/src/audit/__tests__/voc-audit-schemas.test.ts` (referenced but not opened)
  - What: Worth confirming the schema-level test exists for the refinement. Likely already present.
  - Fix: Verify; add if missing.

- **[F19] `voc_triage_committed` does not fire on `dismissed_not_actionable` → `triaged` (if such a transition is even legal)**
  - File: `apps/backend/src/modules/voc/service.ts:490`
  - What: Code: `row.triageState === 'untriaged' && newTriageState === 'triaged'`. So `needs_more_information → triaged` and `dismissed_not_actionable → triaged` do NOT fire `voc_triage_committed`. Spec is silent on whether NMI → triaged should re-fire commit. The strict reading of "only on first untriaged→triaged transition" is consistent with current code. Flag for spec clarification.
  - Fix: Confirm with spec owner; document the decision in the service.

- **[F20] No test verifies `voc_triage_committed` detail snapshot fields are populated from POST-UPDATE state, not PRE-UPDATE**
  - File: `apps/backend/src/modules/voc/service.ts:498-505`
  - What: Detail reads `newSev`, `newOwnerUser2`, `newOwnerTeam2`, `newAa` — all post-UPDATE values. Test 1 only asserts the event TYPE list, not the detail payload.
  - Fix: Add an assertion: query `core.audit_log.detail` for the `voc_triage_committed` row and assert `{ severity: 'high', owner_user_id: <admin>, analytics_area_id: <aa>, cluster_decision: null }`.

## What I checked but found clean

- `selectVocForUpdate` filters by `workspace_id` (`repo.ts:134`) — cross-workspace PATCH attempts return null → 404, no leakage.
- `lockManagedSystem` runs `for update` inside the same tx (`repo.ts:39`); satisfies ADR-0019 §E.
- `checkCapability` receives `{ tx }` and observes `tx` writes (`check-service.ts:92`); satisfies ADR-0019 §D.
- `voc.triage` is marked `sensitive: false` in `CAPABILITY_META` (`capabilities.ts:32`); no `validation.sensitive_reason_required` flow needed.
- Audit event ordering in the standard path matches spec §8.4 step 8: `voc_severity_set → voc_owner_assigned → voc_analytics_area_linked → voc_triage_committed`.
- `voc_triage_committed` fires only on `untriaged → triaged` (test 4 verifies).
- Owner mutex enforced at both Zod (`patch-request.ts:55-61`) and service (`service.ts:258-262`).
- Forbidden-fields list complete per spec: `reporter_facing_status`, `title`, `description_rich_content`, `display_id`, `reporter_id`, `workspace_id`, `primary_managed_system_id`, `cluster_decision` (`patch-request.ts:15-27`).
- `reporter_facing_status` maps to dedicated `voc.reporter_status_via_public_update_only`; all others to `validation.unexpected_field`.
- Idempotency advisory-lock pattern (`pg_advisory_xact_lock(hashtext(actor), hashtext(key))`) mirrors POST `/vocs` and AA service exactly.
- Idempotency hash includes `vocId` (`routes.ts:182`); same key + same body across different VOCs would NOT dedupe (verified manually).
- `fieldsFromZodIssues` is used on every validation failure path in `routes.ts` (line 177); HTTP-M-1 from Slice 3 #13 review remediated.
- FE has no current consumers of `VocEnvelope` / `PatchVocRequest` (grep clean), so envelope widening has no breakage surface.
- No new migrations required; `triage_state_review_postponed_at` already exists from migration 0010.
- `voc_triage_postponed` registered in `AUDIT_EVENT_TYPES` (line 54) and `AUDIT_EVENT_DETAIL_SCHEMAS` (line 162).
- ErrorCode union extended with `conflict.stale_write`, `voc.reporter_status_via_public_update_only`, `permission.scope_required` and STATUS_BY_PREFIX maps each to 409/422/403.
- AA cross-MS check runs only when `input.analytics_area_id !== undefined && !== null && !== row.analyticsAreaId` (`service.ts:237-241`) — clearing AA correctly skips the MS check.
- `If-Match` comparison uses `Date.toISOString()` round-trip (`service.ts:199`); both sides go through the same JS Date → ISO formatter (Postgres returns Date object via pg driver), so microsecond truncation is symmetric and the equality holds.
- `severity` retriage allowed (Q-SEVRETRIAGE) — code path at `service.ts:400-403` correctly diffs.

## Open questions for orchestrator (decisions needed)

1. **F1 (P0)**: Should `permission.scope_required` discriminate by `Decision.reason`? Recommend yes — explicit_deny → `permission.denied`, grant_revoked → `permission.denied` with detail, no_grant + developer + MS-eligible → `permission.scope_required`. Approve the branching logic before implementer changes test 16.
2. **F2 (P1)**: Severity-clear audit — option 1 (widen schema, single verb) or option 2 (new `voc_severity_cleared` verb)? Recommend option 1 — simpler, no new audit vocabulary.
3. **F3 (P1)**: `requestable_permission` envelope position — top-level (per `ErrorEnvelope`) or nested under `detail` (per current impl)? Recommend top-level. Requires either ADR-0012 confirmation or one-line amendment if you want to keep the nested shape (then update `ErrorEnvelope` to match).
4. **F4 (P1)**: Accept the `Promise.all` test fix for concurrency, or do you want the heavier `pool.connect → BEGIN → SELECT FOR UPDATE → setTimeout` harness? Recommend `Promise.all` — adequate evidence with one line of test code.
5. **F7 (P2)**: Should postpone on an already-triaged VOC be a `validation.failed`, or silently a no-op-write? Recommend `validation.failed` — matches spec intent.
6. **F16 (P3)**: Open a follow-up issue for the 60/min triage rate-limit bucket, or fold into #14? Recommend follow-up — bucket plumbing touches `server.ts` more broadly.
