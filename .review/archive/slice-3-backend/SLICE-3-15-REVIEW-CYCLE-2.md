# Slice 3 #15 — Adversarial Review Cycle 2 (Opus)

Independent second-opinion review of `feature/15-get-vocs` (33 commits, ~6.2k LOC). Performed without seeing cycle-1 codex output first; cycle-1 fixes verified at the end.

Verification commands run by reviewer:
- `pnpm -w typecheck` → PASS (cached)
- `pnpm -w check:boundaries` → PASS

---

## BLOCKER

(none)

---

## MAJOR

### N-MAJ-1 — `actorScopeForCapability` silently bypasses MS-scoped deny when actor holds a workspace-wide grant
`apps/backend/src/modules/permissions/scope-service.ts:102-117`

When an actor has a **workspace-wide grant** (`managed_system_id IS NULL`) for `voc.read` plus an active MS-scoped deny for one MS, the function returns `{ kind: 'all' }` and the MS-scoped deny is dropped on the floor. The inline `// WHY` comment explicitly acknowledges the gap and the `TODO(future)`.

Impact:
- `readScope` becomes `'all'` → `msInScope(readScope, deniedMs)` returns `true` → `getVocDetail` for a VOC in `deniedMs` returns the FULL envelope including conversation/internal_comments.
- `listVocsForRead` returns rows from the denied MS (no scope filter applied when scope is `'all'`).
- The cycle-1 `B1b` integration test only covers the **workspace-wide deny** case (which IS handled at line 93). No test exercises `workspace-wide grant + MS-scoped deny`, so the gap is not visible in CI.

This is exactly the scenario `denyCapability` exists for, and the cycle-1 fix description ("MS-scoped deny → remove that MS from the resolved list") promises it.

**Fix (one of):**
1. When grants include a workspace-wide row AND any MS-scoped denies exist, resolve `allManagedSystemIds(workspaceId)` (or `actorEffectiveScope`'s MS list) and return `{ kind: 'scoped', managedSystemIds: allMsIds.filter(id => !deniedSet.has(id)) }`.
2. Or: enforce per-MS deny at the SQL filter layer by always appending `AND primary_managed_system_id NOT IN (deniedMsIds)` to the `listVocsForRead` `wheres` and to `selectVocByIdForRead`. Then `'all'` semantics are preserved at the scope abstraction while denies still cut.

Option 1 is cleaner and matches the existing intersect model in `read-service.ts:141`.

Add integration tests:
- workspace-wide `voc.read` grant + MS-scoped deny on `msA` → list excludes `msA` rows, GET /vocs/:id on a `msA` VOC → 404 not_found.record (existence probe defense).
- same scenario with `voc.triage` → conversation endpoint cannot reach internal_comments on `msA`.

### N-MAJ-2 — `getConversation` resolves `effectiveScope` but never uses it; cross-workspace VOC id still returns 404 (good) but the unused fetch is dead code masking intent
`apps/backend/src/modules/voc/read-service.ts:538-549`

`effectiveScope` is computed and `msInEffectiveScope` derived, but the access-matrix branches at 552/557 only use `msInReadScope`, `isReporter`, and the negation `!msInEffectiveScope` (552) → it IS used. Re-reading — verified used. **Withdrawn.**

### N-MAJ-3 — `cleanupReadTestTables` performs unscoped `DELETE FROM core.idempotency_keys` and `core.rate_limits` in `beforeEach`
`apps/backend/src/modules/voc/__tests__/_seed-helpers.ts:411-412`

These two statements wipe the **entire workspace** every `beforeEach`, including:
- Idempotency rows produced by `patch-voc.integration.test.ts` / `post-voc.integration.test.ts` if they run in the same vitest worker (vitest defaults to one suite per worker, but pool=`forks` shares DB).
- Rate-limit rows used by `post-voc` rate-limit assertions.

This is a clear flakiness vector when the suite grows or the runner config changes (e.g. `--no-isolate`, `--pool=threads`). The pre-existing PATCH/POST suites scope their cleanup by actor/key prefix; the new helper does not.

**Fix:** scope deletes to the test's actor cohort:
```sql
delete from core.idempotency_keys
 where actor_id in (select id from core.actors where external_id like 'mock-dev-read-%' and workspace_id = $1);
delete from core.rate_limits where key like 'mock-dev-read-%' or key like '%/vocs%dev%';
```
or limit by the SLUG_PREFIX-tied actor set (the file already builds that filter for sessions on line 415).

### N-MAJ-4 — Cursor stability silently broken when a VOC's `severity` is mutated mid-pagination (severity sort)
`apps/backend/src/modules/voc/repo-read.ts:336-403`

The plan documents this as "eventually consistent" and the codex review accepted that disposition. However, the cursor encodes `severity_ord` + `id` and the predicate is `(severity IS NULL)::int > ${cursorIsNull} OR (sev_ord > cursor OR (...=cursor AND id > cursor.id))`. If the cursor row's severity changes from `medium` → `null` between pages 1 and 2, the predicate's `severity IS NOT NULL AND sev_ord > 2` branch skips that row's neighbors. Concretely the user can **lose entire severity buckets**, not just dup/skip one row.

Per the plan this is documented as acceptable for Slice 3 — but the docstring in `read-service.ts:listVocs` is missing the warning. Plan §C0 mandates "documented in route docstring."

**Fix:** add a docstring block above `listVocs` (or in `routes.ts` route handler):
```ts
// NOTE: pagination with sort=severity:* is eventually consistent.
// Concurrent severity edits to the cursor row (or rows near the cursor
// boundary) may cause rows to be skipped or appear twice across pages.
// Frontend stale-while-revalidate masks this; integration test coverage
// is limited to sort=created_at:desc which is monotonic.
```

### N-MAJ-5 — Out-of-scope summary count crosses workspace if `core.managed_systems` is shared across workspaces (it isn't — but the SQL is one bug away)
`apps/backend/src/modules/voc/repo-read.ts:735-742`

The query filters `workspace_id = ${workspaceId}` so it's actually safe today. However, `allManagedSystemIds` already filters by `workspaceId`, and `outOfScopeSummary` passes `diffMsIds` derived from that — but if `effectiveScope.kind === 'scoped'`, `diffMsIds` comes from `actorEffectiveScope` (which itself comes from `permission_grants` without joining `managed_systems` for workspace check). A grant row with a stale `managed_system_id` referencing a different workspace's MS would leak into the diff set; the `workspace_id = ${workspaceId}` clause on line 738 saves the count (returns 0 for that MS) but the histogram could still report 0 across non-existent MSs (harmless).

Today the FK from `permission_grants.managed_system_id → core.managed_systems(id)` plus the `workspace_id` column on grants prevents the bad state, but the read path does not assert it. Defense-in-depth: join `permission_grants → managed_systems` ON same workspace.

**Fix is optional**; flag as MINOR if you disagree.

---

## MINOR

### N-MIN-1 — `getConversationQuerySchema` requires `cursor` — first-page-after-inline call has no way to pass "no cursor"
`packages/shared/src/vocs/conversation-query.ts:8`

Spec §8.3 says "If `conversation_timeline.has_more`, fetch via `GET /vocs/:id/conversation?cursor=`". A client that has the inline 50 + a `conversation_page.cursor` from the detail envelope is fine. But the M5 cycle-1 fix introduces `z.string().datetime()` validation, and the `decodeConversationCursor` immediately fails on empty/missing. AC8 in `get-conversation.integration.test.ts:359` synthesizes a `now()` cursor with `randomUUID()` to bypass — that's not a realistic client flow and means the contract has **no first-page entrypoint** for clients that lost the inline cursor (e.g. opened the conversation panel by URL deep-link without first hitting `GET /vocs/:id`).

**Fix:** make `cursor` optional. When absent, repo treats as "from newest"; service returns the first 50 with `nextCursor`. Then the inline detail call becomes equivalent to `GET /vocs/:id/conversation` (no cursor). Document the contract.

### N-MIN-2 — `getVocDetail` summary path: `checkService.checkCapability` is called only to compute `reason`, but the result `decision.allow=true` branch returns `'unknown'` — silent contract violation if a future grant lookup goes async-stale
`apps/backend/src/modules/voc/read-service.ts:418-443`

The "should not reach here" branch returns `state: 'blocked_not_requestable', reason: 'unknown'`. If a race occurs where `actorReadScope` was computed before a grant write and `checkCapability` runs after, the user gets a misleading "blocked" envelope when they actually have access. A subsequent refresh would return the full envelope. Acceptable but log a warning so this is observable.

**Fix:** `req.log.warn({ actor, vocId, primaryMs }, 'detail-summary path: checkCapability allowed but scope missed it')`.

### N-MIN-3 — `getVocDetail` ETag uses only `voc.updated_at`; mutable `voc_permission_decisions_seed_fixture` writes do not invalidate
`apps/backend/src/modules/voc/read-service.ts:409`

The plan claims the seed fixture is immutable. That table has `DELETE` granted to `fops_app` (confirmed in `_seed-helpers.ts:376`), and the test helper `insertPermissionDecisionsSeed` writes rows post-VOC-creation. In production, if Slice 4 starts writing real per-actor decisions to that table (or any tooling does so), the ETag will return 304 for a stale `permission_decisions` payload.

**Fix:** compose `max(voc_permission_decisions_seed_fixture.updated_at)` (add `updated_at` column if needed) into the ETag, OR document in F19 that the composite must include this table too.

### N-MIN-4 — `outOfScopeSummary` returns the *workspace-wide* `effectiveMsIds` when `effectiveScope.kind === 'all'`, calling `allManagedSystemIds` on every list request
`apps/backend/src/modules/voc/repo-read.ts:717-723`

When an actor with `voc.triage` (workspace-wide grant) but no `voc.read` calls `GET /vocs?view=inbox`, the function fetches every MS in the workspace on every paginated request. Cache-free hot path. Add memoization at the request scope (e.g. attach to `req` via a decorator) or skip the call entirely when `readScope.kind === 'scoped' && readScope.managedSystemIds.length === 0` and you're going to return 403 anyway — actually you return 403 before this runs, so it's only triggered when readScope is `'scoped'` with ≥1 MS. Still: per-request DB query for a slow-changing fact.

**Fix:** cheap optimization deferred; or compute the count via a single SQL `WHERE primary_managed_system_id NOT IN (readMsIds)` and skip the MS enumeration entirely:
```sql
SELECT severity, COUNT(*) ...
  WHERE workspace_id = $1
    AND primary_managed_system_id <> ALL($readMsIds::uuid[])
    AND archived_at IS NULL
```
This removes both `allManagedSystemIds` from the call path and the JS-side set diff.

### N-MIN-5 — Conversation cursor `createdAt` text format leakage
`apps/backend/src/modules/voc/repo-read.ts:686-691`

The transform `String(last._created_at_raw).replace(' ', 'T').replace(/\+00$/, '+00:00')` works for UTC postgres output but assumes the session timezone is UTC. If the DB session timezone changes (different deployment, `SET TIME ZONE`), the suffix won't be `+00` and `decodeConversationCursor`'s `z.string().datetime({ offset: true })` will accept e.g. `+09:00` but the SQL `< ${cursor.createdAt}::timestamptz` cast will reinterpret correctly. Net: works, but fragile.

**Fix:** use `toDate(...).toISOString()` unconditionally for cursor encoding (millisecond precision is sufficient — microseconds matter only if same-millisecond collisions are common; the `id` tiebreaker handles that).

### N-MIN-6 — `view=my` ignores read/triage scopes entirely — a reporter can fetch their own VOCs from MSs the workspace later revoked them from
`apps/backend/src/modules/voc/read-service.ts:240-248`

Per the plan this is intentional: reporters always see their own VOCs. But if a reporter is moved out of a MS (e.g. left the team), they retain visibility into their historical reports via `view=my`. Not a security issue — they authored the content — but worth flagging in the spec.

**Fix:** none required; document the policy in `voc.md §8.2`.

---

## NIT

### N-NIT-1 — `read-service.ts:194` comment indent broken
`apps/backend/src/modules/voc/read-service.ts:198-199`

```
      // triage_pinned is not in the listVocsQuerySchema sort enum so this
    // branch is unreachable at runtime — guard kept for belt-and-suspenders.
```
Two-space outdent on line 199. Cosmetic.

### N-NIT-2 — Duplicate `feat(slice3 #15 C3): add read rate-limit tier to server.ts` commits
Commits `a535066` and `31890f9` have identical messages and back-to-back ordering. Likely an accidental empty commit. Squash before PR.

### N-NIT-3 — `repo-read.ts:281` parses cursor parts assuming `>= 4` but old 3-part format `createdAt = parts[2] ?? ''` — old cursors silently misparse
The 4-part cursor format is only emitted by this branch; no old cursors exist in production. The `parts.length >= 4 ? slice(3) : parts[2]` backward-compat is dead code. Remove.

---

## CYCLE-1 FIX VERIFICATION

| Finding | Verdict | Notes |
|---|---|---|
| **B1** scope ignores denies | `[CYCLE-1 PARTIAL]` | Workspace-wide deny + MS-scoped deny on MS-scoped grant: VERIFIED (`scope-service.ts:93,98-100,124`). Workspace-wide grant + MS-scoped deny: **REGRESSION/UNCAUGHT GAP** — see N-MAJ-1. The cycle-1 fix author flagged this as a `TODO(future)` rather than fixing it. |
| **B2** reporter_replies leak | `[CYCLE-1 VERIFIED]` | `repo-read.ts:579-617` correctly: triage → all replies; isReporter && !canTriage → `actor_id = $actorId`; else → omit branch entirely. UNION composition handles single-branch correctly via `branches.length === 1` fallback (line 645). |
| **M1** effective_scope too wide | `[CYCLE-1 VERIFIED]` | `repo-read.ts:54-71` unions only `voc.read ∪ voc.triage`; admin → all. |
| **M2** workspace_id defense in depth | `[CYCLE-1 VERIFIED]` | `selectConversationPage` (`repo-read.ts:569,595,610,635`) and `selectPermissionDecisionsSeed` (`repo-read.ts:780`) JOIN to `voc.vocs v ON v.workspace_id = $workspaceId AND v.archived_at IS NULL`. `outOfScopeSummary` filters by `workspace_id` directly (line 738). |
| **M3** If-None-Match multi-value | `[CYCLE-1 VERIFIED]` | `routes.ts:314-319` handles comma-split + `*` wildcard. |
| **M4** 304 missing cache-control | `[CYCLE-1 VERIFIED]` | `routes.ts:322` sends `cache-control: private, no-cache` on the 304 path. |
| **M5** conversation cursor loose | `[CYCLE-1 VERIFIED]` | `read-service.ts:63-66` zod schema with `datetime({offset:true})` + `uuid()`; bad → `HttpError('validation.failed', 'invalid_cursor')`. Integration test `AC6b` covers. |
| **M6** severity null ordering | `[CYCLE-1 VERIFIED]` | `repo-read.ts:186-193` (`ELSE NULL`), explicit `(severity IS NULL) ASC` prefix in ORDER BY (`repo-read.ts:412, 322`), cursor encodes `isNull` flag (`repo-read.ts:469-472`). M6a/M6b integration tests assert ordering. |
| **M7** core.managed_systems boundary | `[CYCLE-1 VERIFIED]` | Moved to `apps/backend/src/modules/core/managed-systems/read-projections.ts`; voc/repo-read.ts imports from there. Documented as approved cross-module projection. |
| **m1** workspace isolation ceremonial | `[CYCLE-1 VERIFIED]` | Test at `list-vocs.integration.test.ts:552-618` now inserts a second-workspace VOC via raw SQL (bypasses middleware), asserts both list non-inclusion and detail 404. |
| **m2** rate-limit test ceremonial | `[CYCLE-1 PARTIAL]` | `app.hasRoute` + `printRoutes` confirms registration; no assertion on `max=300`. Acceptable lower-cost smoke; not actually verifying the limit is set to 300 vs say 5. |
| **n1** typo msMsInReadScope | `[CYCLE-1 VERIFIED]` | No occurrence of `msMsInReadScope` in current diff. |

Verified: 9 · Partial (gap): 2 · Regressed: 0.

The B1 partial is the consequential one — it's promoted to N-MAJ-1.

---

## Disposition

- N-MAJ-1 should be addressed before PR (real authz bypass; small fix).
- N-MAJ-3 should be addressed before PR (flakiness vector; trivial scoping fix).
- N-MAJ-4 is documentation only; can be done in PR description.
- All MINORs and NITs are follow-up candidates.
- N-MAJ-2 withdrawn after re-read.
- Cycle-1 fixes are otherwise solid; the codex pass did good work.
