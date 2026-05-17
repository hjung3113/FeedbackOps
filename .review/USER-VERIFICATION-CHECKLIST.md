# Slice 2 #8 + adversarial review — user verification checklist

Generated 2026-05-17 after the F-010 follow-up + 4-persona adversarial
review (`db`, `services`, `http`, `tests`). All four review files live in
`.review/F010-AND-SLICE2-REVIEW-{db,services,http,tests}.md` and remain
the source of truth for finding IDs.

This session committed nine things to `main` (no push):

| Commit | Scope |
|---|---|
| `3afdb62` | Slice 2 #8 SECURITY DEFINER shim for `pgboss.create_queue` (F-010 resolved) |
| `0cc53f6` | Migration 0008: DB-001 / DB-002 / DB-004 / DB-005 / DB-006 |
| `47006dc` | HTTP H-1 / H-2 / M-1 / M-3 hardening |
| `c869707` | Test coverage C2 / H1 / H4 / H5 / L2 / L3 |
| `97bac9a` | ADR-0019 + Section C: `core.teams` grant tightened to SELECT-only (DB-003) |
| `2865d43` | ADR-0019 Sections A + B: archived-row immutable + cascade-race recovery (S-003, H2 Q1/Q2) |
| `7a3109d` | ADR-0019 Section E: `SELECT FOR UPDATE` on parent MS at AA register / update / archive (S-004) |
| `d7af915` | ADR-0019 Section D: check-service step 5 is first-class (S-005) |

Backend suite: 147 passing. `typecheck` + `check:boundaries` clean.

ADR-0019 ("Slice 2 review follow-ups") is the new follow-up ADR
documenting all five locked decisions from Section A of this
checklist. ADRs 0012, 0017, and 0018 each carry a one-line pointer
to ADR-0019 for the specific clauses it amends.

---

## 1. Findings deferred to user decision

Each item below was NOT auto-applied because it requires one of:
(a) a new ADR or amendment to an existing locked ADR, (b) a refactor wider
than the smallest-fix rule, (c) a domain rule that has no current locked
answer, or (d) test infrastructure (multi-workspace seed, mock injection
harness) that is itself a slice-sized commit.

### 1.1 New / amended ADR required — RESOLVED 2026-05-17 via ADR-0019

All three findings below were resolved this session by writing ADR-0019
("Slice 2 review follow-ups") and applying its decisions:

| ID | Resolution | Commits |
|---|---|---|
| **S-003** | ADR-0019 Section A: archived rows immutable; new `conflict.record_archived` code added to ADR-0012. MS + AA update services reject 409 on `archived_at IS NOT NULL`. | `2865d43` |
| **S-005** | ADR-0019 Section D: step 5 separated formally; emits `via: 'managed_system_scope'`. Step 3 now matches workspace-wide grants only. Slice 3 fallback direction (MS grant satisfies workspace check on MS-eligible capabilities) explicitly deferred. | `d7af915` |
| **DB-003** | ADR-0019 Section C: migration 0009 revokes INSERT/UPDATE/DELETE on `core.teams` from `fops_app`. SELECT remains. The team CRUD slice restores write grants alongside the management service. | `97bac9a` |

### 1.2 Refactors wider than the smallest-fix rule

| ID | Severity | Summary | What lands |
|---|---|---|---|
| **S-001** | H | `idempotency_keys` race fix (F-005) closed only the idempotency-row insert side. The domain-table insert still races against `managed_systems_workspace_slug_active_uq` / AA partial unique / `permission_requests_active_uq`. Two concurrent first-time retries from the same `(actor, key)` surface 409 `conflict.duplicate_slug` (or sibling) instead of replaying. | Take a `pg_advisory_xact_lock(hashtext(actor_id || key))` inside the tx before the domain INSERT; re-`lookup` after acquiring; loser observes the stored response and replays. Add a concurrent-retry integration test. Updates ADR-0015 narrative around the protocol's race surface. |
| **S-002** | H | `requireWorkspaceAdmin` runs `checkService.checkCapability` against `deps.db` (pool), not the open `tx`. A revoke that commits between the read and the mutation is invisible. Today the `admin` role-derived path masks this; Slice 3's MS-scoped grant path will surface it immediately. | Thread `tx` through `checkCapability` (or add a `checkCapabilityInTx(tx, …)` variant). Also touches `request-service.ts:134-139` re-check. ~150 LOC across check-service + every Slice 2 mutation site. |
| **S-006** | M | Twenty-plus `tx as unknown as Db` casts across MS + AA + permission services. The cast compiles because `Tx = Db`; the alias is the bug. A future maintainer can pass the pool where the tx was intended (the exact failure mode S-002 documents). | Replace `Tx = Db` in `audit-service.ts` + `idempotency-service.ts` with a `Db \| PgTransaction<typeof schema>` union (or a `DbHandle` brand). Drop every cast. Type system enforces tx-not-pool. |
| **HTTP L-1** | L | `loadActorContext` is called per-request after `requireSession` even though the session row already joins `actors`. Add `role_level` to `req.session` and drop the helper. | ~3 routes + `require-session.ts` middleware adjustment. |

### 1.3 Domain rules — RESOLVED 2026-05-17 via ADR-0019

| ID | Resolution | Commits |
|---|---|---|
| **H2 / B Q1** | ADR-0019 Section B Q1: PATCH on active AA under archived parent → 409 `conflict.parent_archived`. AA update service looks up parent MS in the same tx with `FOR UPDATE`. | `2865d43` + `7a3109d` |
| **B Q2** | ADR-0019 Section B Q2: standalone archive on active AA under archived parent permitted. Test pins the behavior. | `2865d43` |
| **B Q3** | ADR-0019 Section B Q3: unarchive deferred. No endpoint in Slice 2/3. Operators use slug reuse. Tracked as Slice 3+ reopen trigger. | (no code) |
| **S-004** | ADR-0019 Section E: `SELECT FOR UPDATE` on parent MS at AA register, update, archive. Serialises against MS archive. | `7a3109d` |

Still open:

| ID | Severity | Summary | Decision needed |
|---|---|---|---|
| **S-008** | L | `canonicalizeJson` drops keys whose value is `undefined`. Update body `{ external_key: undefined }` and `{}` hash identically; a retry that flips a field from absent → explicit-null replays the first response. | Either (a) sentinel-encode undefined in `canonicalizeJson`, or (b) drop the `?? null` coalescing in service hash inputs. (a) is the broader fix. |

### 1.4 Test infrastructure prerequisites

| ID | Severity | Summary | Infrastructure |
|---|---|---|---|
| **C1** | C | Tenant isolation: zero test verifies that a session for workspace B cannot read / write workspace A's MS / AA / permission rows. The CheckService `workspace_mismatch` branch is dead-coverage. | Need a `seedSecondWorkspace()` test helper that adds a second workspace + admin + user, exposes a second login flow. Once that exists, ~6 negative tests (MS list, MS POST, MS archive, AA list, AA POST, AA archive cross-tenant). |
| **C4** | C | MS archive cascade has no partial-failure rollback test. The audit-in-tx contract (ADR-0017:58 "in the same transaction") has only the happy path. | Service-level unit test with a failing `auditService` stub injected into one cascade iteration. Requires extracting `cascadeArchiveActiveChildren` into a unit-testable shape (currently a closure inside `analytics-area-service.ts`). |
| **H3** | H | AA create where parent MS is in a different workspace: returns `not_found.record` at `analytics-area-service.ts:249-251` but no test covers this branch. | Depends on the C1 helper. |
| **H6** | H | pg-boss job-handler failure → retry behavior is untested. The config columns (`retry_limit`, `retry_delay`, `retry_backoff`) are asserted but a regression that wires the config and ignores thrown errors would pass. | Either submit a job with a throwing handler and poll `pgboss.job` for retry count, or unit-wrap `purgeExpiredIdempotencyKeys` with a throwing stub. The latter is faster. |
| **M2** | M | Concurrent same-key idempotency `onConflictDoNothing` race documented at `idempotency-service.ts:70-78` has no test. | Two `pg` clients, both BEGIN, both call `record(…)` with the same `(actorId, key)`, both COMMIT. Assert one row, no error. |

### 1.5 Smaller polish items not auto-applied

These were judged low-value-per-byte for this session — fine to land
in a future slice or skip outright.

| ID | Severity | Summary |
|---|---|---|
| HTTP M-2 | M | `PUBLIC_ATTACHMENT_ORIGIN` defaults to literal `"'self'"` producing duplicated `'self'` in CSP, and no URL validation on overrides. |
| HTTP L-2 | L | `validation.immutable_field` only checks top-level keys; if the schema later nests fields the guard misses them. |
| HTTP L-3 | L | No explicit `bodyLimit` override; documents Fastify's 1 MB default. |
| S-007 | L | Cascade AA archive audit summary is hardcoded "Analytics Area archived"; MS sibling includes slug. Asymmetric. |
| S-009 | L | `listManagedSystems` / `listAnalyticsAreas` issue two queries (page + count) on different connections; can disagree under writes. |
| S-010 | L | `apps/backend/src/modules/core/audit/` and `…/idempotency/` carry only stub CLAUDE.md, no module-local AGENTS.md. The MS+AA services depend on them and would benefit from pinned tx-not-pool guidance. |
| DB-007 | L | `core.actors` partial unique on archived rows — no current ADR requires it (actors aren't archivable yet). Note for whoever lands actor archival. |
| C3 (extension) | C | Already partially applied (added `"True"` / `"TRUE"` / `1` rejection tests in commit `0cc53f6`). What is NOT pinned: `{"PARTITION":true}` upper-case-key behavior. Today it passes the guard (key mismatch) and the underlying function also treats it as falsy — coincidentally safe. Worth a one-liner test if the policy is "strict reject any partition-like signal". |
| M1 | M | `auditEventDetailSchemas.managed_system_updated.parse({...changes: {}})` rejection isn't unit-tested; the service-level no-op short-circuit is the only thing keeping the schema valid. |
| M3 | M | `analytics-area-service.ts:528` ordering by `(managedSystemId, slug)` is what the frontend grouped UI depends on, but no test pins the order. |
| M4 / M5 | M | Frontend admin MS archive button + include-archived toggle + edit-save flow + AA archive flow + clear-MS-filter-back-to-grouped — all untested at the route level despite test ids existing in the components. |
| M6 | M | `GET /managed-systems?slug=<slug>` filter has no test. ADR-0017:22 names it as the canonical slug→UUID resolution path. |
| M7 | M | Per-route mutation rate-limit (`app.rateLimitConfig.mutation`) is wired but no behavioral test asserts a 429. |
| M8 | M | Cascade AA archive audit row only asserts `cascade_source_managed_system_id`; the standalone variant asserts the full detail shape. Asymmetric coverage. |
| L4 | L | "Archived MS row remains FK-able from new permission_grants" — historical-record promise (ADR-0017:65) is asserted only for the unknown-MS rejection direction. |
| L5 | L | Between-test isolation relies on the `it-` slug prefix + `created_user_agent_summary='integration-test'` cleanup. Two suites already share these tables; Slice 3 growth raises collision risk. |

---

## 2. Manual QA scenarios (recommended)

Run these by hand before pushing or closing issues #8/#9/#10/#11. Each
scenario verifies the auto-applied fixes against a clean database.

### 2.1 Clean reboot + migrate + seed

```bash
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up -d
cd /Users/hyojung/Desktop/2026/FeedbackOps
export DATABASE_URL="postgres://fops_app:fops_app@localhost:5434/feedbackops"
export DATABASE_URL_MIGRATE="postgres://fops_migrate:fops_migrate@localhost:5434/feedbackops"
export WORKSPACE_ID="11111111-1111-1111-1111-111111111111"
export PORT=3011 HOST=127.0.0.1 NODE_ENV=development AUTH_PROVIDER=mock
pnpm --filter @fops/backend db:migrate
pnpm --filter @fops/backend db:seed
```

Verify:
- Migration run lists `0008_slice2_review_followups` in the apply log.
- No errors during seed.

### 2.2 Backend test suite (full)

```bash
pnpm --filter @fops/backend test
```

Expected: 147 passing.

### 2.3 Frontend test suite

```bash
pnpm --filter @fops/frontend test
```

Expected: 32 passing (unchanged — frontend tests were not touched).

### 2.4 Boot guard (HTTP-H-1) manual check

```bash
NODE_ENV=production AUTH_PROVIDER=mock pnpm --filter @fops/backend dev
```

Expected: boot fails immediately with
`AUTH_PROVIDER=mock is not permitted in production (ADR-0006). Set AUTH_PROVIDER=oidc.`

### 2.5 Admin UI smoke (browser)

```bash
pnpm dev   # starts backend + frontend
```

Open `http://localhost:3010/admin/managed-systems` after logging in as
`mock-admin-1` via the mock-login picker.

Walk through:
1. Create a new MS with slug `manual-qa-1`, name "Manual QA 1".
   Expect: 201, row appears in the list, audit_log has
   `managed_system_registered`.
2. Edit the name to "Manual QA 1 renamed". Expect: 200, audit_log has
   `managed_system_updated` with `name: { from: "Manual QA 1", to: "Manual QA 1 renamed" }`.
3. Archive it. Expect: row disappears from default list, reappears when
   `include_archived=true`, audit_log has `managed_system_archived`.
4. **PATCH the archived MS** (e.g. via the edit modal on the archived row,
   or via direct API call). Expect: 409 `conflict.record_archived`
   (ADR-0019 Section A).
5. Re-create with the same slug `manual-qa-1`. Expect: 201 with a new
   UUID (verifies L2 service-path slug reuse).
6. Open `/admin/analytics-areas`. Create an AA under "Manual QA 1
   (archived)". Expect: 409 `conflict.parent_archived`.

### 2.6 Cascade-race lock (psql, two sessions)

ADR-0019 Section E verification. Open two psql sessions as `fops_app`.

```bash
PGPASSWORD=fops_app psql -h localhost -p 5434 -U fops_app -d feedbackops
```

Session A:
```sql
begin;
select id, archived_at from core.managed_systems
  where slug = 'tableau' and workspace_id = '11111111-1111-1111-1111-111111111111'
  for update;
-- holds the row lock; do NOT commit yet
```

Session B:
```sql
begin;
update core.managed_systems set archived_at = now(), updated_at = now()
  where slug = 'tableau' and workspace_id = '11111111-1111-1111-1111-111111111111';
-- blocks waiting on Session A's lock
```

Expected: Session B hangs. Run `ROLLBACK;` in Session A — Session B
immediately resumes. (`ROLLBACK;` Session B too to keep the seed
intact.) Confirms parent-row write contention serialises across
sessions, which is the mechanism Section E relies on for AA
register/update/archive vs. MS archive.

### 2.7 F-010 SECURITY DEFINER shim (psql)

```bash
PGPASSWORD=fops_app psql -h localhost -p 5434 -U fops_app -d feedbackops \
  -c "select pgboss.create_queue('manual-test-1', '{\"partition\":true}'::jsonb)"
# expect: ERROR: ... 42501 ... partition=true is not permitted ...

PGPASSWORD=fops_app psql -h localhost -p 5434 -U fops_app -d feedbackops \
  -c "select pgboss.create_queue('manual-test-1', '{\"partition\":\"True\"}'::jsonb)"
# expect: same 42501 (DB-006 strict guard)

PGPASSWORD=fops_app psql -h localhost -p 5434 -U fops_app -d feedbackops \
  -c "select pgboss.create_queue('manual-test-2', '{\"partition\":false,\"policy\":\"standard\"}'::jsonb)"
# expect: success

PGPASSWORD=fops_app psql -h localhost -p 5434 -U fops_app -d feedbackops \
  -c "select pgboss._create_queue_unsafe('manual-test-3', '{\"partition\":false,\"policy\":\"standard\"}'::jsonb)"
# expect: ERROR: ... 42501 ... permission denied for function _create_queue_unsafe
```

### 2.8 Index sanity (psql)

```bash
PGPASSWORD=fops_migrate psql -h localhost -p 5434 -U fops_migrate -d feedbackops \
  -c "\\d core.managed_systems" \
  -c "\\d permission.permission_grants"
```

Expect: six new indexes on `managed_systems` + sibling FK indexes on
`permission.*` (cf. migration 0008).

---

## 3. Recommended push / issue-close order

When the manual QA above passes:

1. **Push.** `git push origin main`
2. **Issue closes (in commit order):**
   - **#8** — close referencing commits `3afdb62` + `0cc53f6` (F-010 +
     DB-001/002/004/005/006 follow-ups).
   - **#11** — close referencing commit `b61a521` (already on `main`).
   - **#10** — close referencing commit `26a52fe`.
   - **#9** — close referencing commit `58fd9d8`.
3. **PR vs direct main:** Slice 2 has been landing directly on `main`
   per prior session pattern. If you want a retrospective PR for review
   visibility, open one against `main` with the seven Slice 2 commits
   (`a1d64ca`..`c869707`) and use the commit messages as the body.
4. **Slice 3 prep:** the still-deferred Section 1 findings (especially
   S-001 idempotency advisory lock, S-002 capability-check-on-tx,
   S-006 Tx type narrowing, C1 tenant infra) should land in a Slice 3
   prologue PR before any new product surface — they all become
   load-bearing the moment MS-scoped grant satisfaction (now formally
   wired in Slice 2 via ADR-0019 Section D) starts being seeded with
   real grants.

---

## 4. Items explicitly NOT done this session

- No `gh issue close` calls (the orchestration rule forbids agent-driven
  issue close).
- No `git push` (orchestration rule).
- No visual polish or design-token changes (waiting on the design HTML).
- No new ADR drafts. Any items in Section 1.1 that need an ADR have been
  flagged but not authored — those decisions are yours.
- No multi-workspace seed helper (gates C1, H3).
- No service-level mock injection harness (gates C4).
- No `gh issue create` for the deferred Section 1 findings. If you want
  any of them as standalone issues for Slice 3 grooming, say so and I
  can draft the bodies in the next session.

## Resolved 2026-05-17 (Slice 3 prologue, commits 5c31a26..b40c608)

| ID | Plan task | Commit | Summary |
|---|---|---|---|
| S-006 | T1 | `5c31a26` | `Tx = Db \| DrizzleTx` union; 26 casts removed |
| S-002 | T2 | `2ab5d1f` | tx-scoped `checkCapability(..., { tx })` threading + new integration test |
| S-001 | T3 | `9917b2c` | `pg_advisory_xact_lock(hashtext(actor), hashtext(key))` at MS/AA/request register paths + ADR-0015 narrative amendment |
| S-008 | T4 | `814be51` | `canonicalizeJson` sentinel-encodes `undefined` (distinguishes absent vs explicit-undefined) |
| HTTP L-1 | T5 | `c8ee24f` | `role_level` in `req.session` via CTE+JOIN in `loadAndTouch`; dropped three `loadActorContext` helpers |
| C1 | T6 | `57057ed` | `seedSecondWorkspace` test helper |
| H3 | T7 | `376cbcc` | service-level pin for foreign-workspace AA parent rejection (HTTP-layer pre-empted by `requireWorkspace` env gate in MVP single-tenant mode; pinned at the AA service `not_found.record` branch instead) |
| C4 | T8 | `249cc86` | `cascadeArchiveActiveChildren` rollback-on-audit-failure regression test |
| H6 | T9 | `a9366d5` | extracted `__purgeHandler` factory + unit test pinning pg-boss error-propagation contract |
| M2 | T10 | `cb7f2ad` | concurrent `idempotencyService.record` `onConflictDoNothing` integration test (sequenced two-conn pattern; `Promise.all` would deadlock on row-lock wait in real transactions) |

Items in §1.5 (HTTP M-2, L-2, L-3, S-007, S-009, S-010, DB-007, C3 extension, M1, M3, M4/M5, M6, M7, M8, L4, L5) were explicitly out of scope for this prologue per plan §"Out of scope (explicit non-goals)" and will be re-evaluated when Slice 3 product surface lands on top of any of them.
