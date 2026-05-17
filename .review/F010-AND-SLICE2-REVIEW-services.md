# Backend application service adversarial review (commits a062062..HEAD)

Scope: `apps/backend/src/modules/managed-systems/managed-system-service.ts`,
`apps/backend/src/modules/analytics-areas/analytics-area-service.ts`,
`apps/backend/src/modules/permissions/check-service.ts`,
`apps/backend/src/modules/permissions/request-service.ts`,
`apps/backend/src/modules/core/audit/audit-service.ts`,
`apps/backend/src/modules/core/idempotency/idempotency-service.ts`,
`apps/backend/src/modules/core/idempotency/canonicalize.ts`,
`apps/backend/src/modules/core/jobs/*`,
`apps/backend/src/db/client.ts`.

Authority: AGENTS.md → ADR-0008/0012/0015/0017/0018 → docs/implementation/02 & 05.

## Critical

_(none)_

## High

### [S-001] Concurrent first-time idempotent register/AA-create returns 409 duplicate_slug instead of replaying — partial F-005 regression
**Where:** `apps/backend/src/modules/managed-systems/managed-system-service.ts:152-199`;
`apps/backend/src/modules/analytics-areas/analytics-area-service.ts:217-286`;
`apps/backend/src/modules/permissions/request-service.ts:110-189`.
**Why it matters:** ADR-0015:73-77 locks the idempotency protocol verbatim:
> "1. Looks up `core.idempotency_keys WHERE actor_id, key` (24-hour TTL). 2. If found and the stored request hash matches, returns the stored response verbatim. 3. If found but the request hash differs (same key, different payload — client bug), returns `409 conflict.idempotency_key_reuse`. 4. If not found, runs the handler, stores `(actor_id, key, request_hash, response_status, response_body, …)` inside the same transaction as the mutation, and returns the response."

`idempotency-service.record` was hardened against the same-key insert race in
the Slice-1 follow-up to F-005 (now uses `onConflictDoNothing`). But the
register/create paths still execute the domain `INSERT` against
`managed_systems` / `analytics_areas` / `permission_requests` *before*
recording the idempotency row. Two concurrent requests with the same
`(actor_id, Idempotency-Key)` and the same body both pass `lookup → miss`,
both attempt the domain insert, the second blocks on
`managed_systems_workspace_slug_active_uq` (or the AA partial unique, or
`permission_requests_active_uq`) until the winner commits, then aborts
with `23505`. The catch arms translate that into `conflict.duplicate_slug`
(MS / AA) or `conflict.permission_request_duplicate` (PR), and the user
sees a 409 from a *legitimate* retry — exactly the surface ADR-0015:93
calls out as the reason DB-constraint-only idempotency was rejected:
> "DB-constraint-only idempotency was rejected: it surfaces as `409 conflict.duplicate_key` to clients that legitimately retry on network timeout, forcing each client to re-handle the conflict differently per endpoint."

The race is small but reachable: the existing `request-service.ts` Slice-1
fix only closed the `idempotency_keys` insert side of the same race; the
domain-table insert side reopens the failure mode for every mutating
endpoint Slice 2 added.
**Recommendation:** Before the domain INSERT, take a row-level advisory
lock keyed on `hash(actor_id, key)` (e.g.
`SELECT pg_advisory_xact_lock(hashtext($1 || $2))`) inside the transaction
on the `miss` branch, then re-`lookup`. The loser blocks until the winner
commits, then observes the stored response and replays it verbatim. Add
an integration test that fires two concurrent register-MS POSTs with the
same Idempotency-Key and asserts both observe a 201 with identical body.

### [S-002] Capability check runs on the pool, not the open transaction — read of `permission_denies` / `permission_grants` is outside the mutation tx
**Where:** `apps/backend/src/modules/managed-systems/managed-system-service.ts:117-127,171,259,410`;
`apps/backend/src/modules/analytics-areas/analytics-area-service.ts:108-118,236,345,450`;
`apps/backend/src/modules/permissions/check-service.ts:71-78,86-97,106-120`.
**Why it matters:** AGENTS.md:66 says verbatim:
> "Backend application services own transactions, permissions, audits, idempotency, and cross-system commands."

`requireWorkspaceAdmin` is invoked inside `db.transaction(async (tx) => …)`
but `checkService.checkCapability` reads `deps.db` (the pool / outer
handle), not the `tx`. The deny / grant lookups therefore run against a
*different connection* with its own snapshot. A concurrent revoke that
commits between the pool-side check and the tx-side INSERT silently
passes — the service writes a Managed System (or archives one) on
behalf of an actor whose `workspace.admin` was already revoked at
mutation commit time. ADR-0015 mandates transactional consistency for
the audit/idempotency story; AGENTS.md mandates that the *service* own
the permission check inside that frame. Today the role-derived
`admin` branch (check-service.ts:185-187) masks the bug because
`role_level` doesn't typically change mid-transaction, but Slice 3's
MS-scoped grant path will exercise this gap immediately (a revoked
direct-grant is precisely the case 05-policy:85-86 names: "When a
permission grant expires, previously opened objects or actions that
depended on that grant must stop executing privileged actions.").
**Recommendation:** Thread `tx` through `checkService.checkCapability`
(or add a `checkCapabilityInTx(tx, …)` variant) so the deny/grant
selects share the transaction snapshot of the subsequent mutation.
This also closes a latent gap in `request-service.ts:134-139` where
the re-check is read-outside-tx for the same reason.

## Medium

### [S-003] Update paths allow mutating an archived Managed System / Analytics Area
**Where:** `apps/backend/src/modules/managed-systems/managed-system-service.ts:261-352`;
`apps/backend/src/modules/analytics-areas/analytics-area-service.ts:347-398`.
**Why it matters:** ADR-0017:47-48 locks:
> "Archive: timestamp + actor, automatic cascade MS → AA, slug reusable after archive"

and ADR-0017:65 says archived rows "remain visible on historical records"
read paths but are filtered from active pickers. The intent of the
`archived_at` timestamp is that archived rows are historical and
immutable except for re-registration via a new row. Both update services
look up `existing` by `(workspace_id, id)` without filtering on
`isNull(archivedAt)`, then happily PATCH `name` / `external_key` /
`default_owner_*` / `owner_team_id` and emit a `managed_system_updated`
audit row carrying changes to a row whose `archived_at` is non-null.
Historical records that join through the UUID render the *post-archive*
mutated name, contradicting the read-path contract ADR-0017:65 locks.
The DB CHECK does not block it because no constraint exists.
**Recommendation:** In both update services, after fetching `existing`,
short-circuit with a typed error when `existing.archivedAt !== null`.
A new ADR-0012 code (e.g. `conflict.record_archived`) is the minimal
addition; the alternative is to reuse `conflict.parent_archived` only
for MS-archived-AA-blocked-on-register and add a sibling
`conflict.record_archived` for "this row itself is archived". Either
way pin it before Slice 3 imports MS/AA update flows.

### [S-004] AA register lets a parent MS be archived between the existence check and the child INSERT (intra-tx race window collapsed, but cross-tx still open)
**Where:** `apps/backend/src/modules/analytics-areas/analytics-area-service.ts:239-258,262-271`.
**Why it matters:** ADR-0017:60 states:
> "Refusing the archive when active children exist (`409 managed_system_has_active_children`) was rejected because it forces operators through a multi-step cleanup … MVP workspaces are small enough that a transactional cascade is fast and unambiguous."

The cascade is documented as the active-children mechanism, so the
register-AA path's job is to *not* race the cascade. Today the parent-
MS lookup at line 239-247 uses the same `tx` (good), but it reads at
the default `READ COMMITTED` isolation with no row lock. A concurrent
archive-MS transaction can have already updated `managed_systems.archived_at`
in its own (uncommitted) tx; the registering tx sees the *pre-archive*
snapshot, inserts the child AA, the archive commits first, then this
tx commits a *fresh active* AA under an archived parent. The cascade
already ran and did not see the new child because the new child did
not yet exist when the cascade SELECT ran. Result: an active AA whose
parent MS is archived, which is the exact registry state ADR-0017:60
("active-looking AAs route VOC into a retired MS") was designed to
forbid.
**Recommendation:** `SELECT … FOR UPDATE` the parent MS row at
analytics-area-service.ts:239 (or `FOR SHARE` — the archive path
already `UPDATE`s and would block). Either lock form serializes
register vs. cascade so the final committed state is consistent.

### [S-005] MS-scope-grant satisfaction in `check-service.ts` step 3 contradicts the file's own step-5-deferred comment, with no test pinning the divergence
**Where:** `apps/backend/src/modules/permissions/check-service.ts:128-136,153-161`.
**Why it matters:** docs/implementation/05-permission-policy.md:22-31 locks
the check order verbatim:
> "1. Validate workspace context. 2. Check explicit deny. 3. Check direct capability grant. 4. Check role-derived capability. 5. Check scoped Managed System permission. 6. If denied, determine whether request access is allowed."

The file-header comment (lines 13-15) and the step-5 block comment
(lines 153-161) state that Slice 1/2 leaves step 5 a no-op deferred
to Slice 3. But step 3 at lines 130-136 *does* match MS-scoped grants
(`row.managedSystemId === scope.managed_system_id`) when the caller
supplies `scope.managed_system_id`. That collapses what 05-policy
defines as two distinct steps into step 3, and the deferral comment
becomes a lie: MS-scoped grant satisfaction *is* live, just under
step 3's branch. A reader who trusts the comment will believe MS
scopes don't yet allow, which is wrong; a reader who trusts the code
will miss the policy's intent that MS-scope satisfaction should be a
separately-attributable `via: 'managed_system_scope'` decision (the
Decision union at line 48 already declares that variant — it's never
returned).
**Recommendation:** Either (a) move the MS-scoped-grant match out of
step 3 into a dedicated step-5 block and emit
`{ allow: true, via: 'managed_system_scope', grant_id }`, restoring
the 05-policy ordering and giving the audit/state-mapper a distinct
attribution; or (b) update the file-header + block comments to state
that MS-scope grants are evaluated *within* step 3 in Slice 2, and
delete the `'managed_system_scope'` variant from the Decision union
until Slice 3 actually emits it.

### [S-006] `db.transaction` use of `tx as unknown as Db` propagated to every Slice 2 service — type-bridge hides the tx/Db divergence the audit + idempotency contract relies on
**Where:** `apps/backend/src/modules/managed-systems/managed-system-service.ts:155,201,219,243,313,366,391,428,473`;
`apps/backend/src/modules/analytics-areas/analytics-area-service.ts:220,288,306,329,378,400,412,433,464,477,496`;
`apps/backend/src/modules/permissions/request-service.ts:114,192,219`.
**Why it matters:** ADR-0008:7-22 mandates that the audit row commits in
the same transaction as the mutation:
> "Audit events live in a single Postgres table inside the same database as the rest of the domain, so the business mutation and its audit row commit in **one transaction**"

`auditService.record` and `idempotencyService.record` both type their
first parameter as `Tx = Db` (audit-service.ts:25, idempotency-service.ts:32).
Every Slice 2 call site reaches into the transaction callback's `tx`
parameter and passes `tx as unknown as Db` — twenty-plus casts across
three services. The cast compiles because `Tx` is aliased to `Db`,
but the alias is the bug: `db.transaction(cb)` hands `cb` a
`PgTransaction<…>`, not a `Db`. The casts mask the divergence and
make it possible for a future maintainer to pass the pool-side `db`
where `tx` was intended (the exact failure mode S-002 documents for
check-service). AGENTS.md:66 puts transaction discipline in the
service layer; the cast surface is undisciplined.
**Recommendation:** Change `Tx` in audit-service.ts and
idempotency-service.ts from `= Db` to the actual
`PgTransaction<typeof schema>` shape (or a `Db | PgTransaction<…>`
union expressed via a `DbHandle` type). Drop every
`as unknown as Db` site. The type system then enforces "tx not pool"
at every call.

## Low

### [S-007] `archiveAnalyticsAreaInTx` summary is hardcoded "Analytics Area archived" — does not include slug, breaks parity with MS archive summary
**Where:** `apps/backend/src/modules/analytics-areas/analytics-area-service.ts:154`.
**Why it matters:** ADR-0008:18 specifies `summary` as
> "text not null — short human-readable line"

and the sibling MS-archive summary at `managed-system-service.ts:468`
includes the slug (`Managed System archived: ${archived.slug}`).
Standalone AA archive (route-driven) and cascade AA archive (helper-
driven) both pass through `archiveAnalyticsAreaInTx`, which discards
the slug and emits a generic line. Future audit-log eyeballing on the
BI side loses the human-readable handle on every cascaded archive,
right when the cascade is the one event the operator needs to scan
fastest.
**Recommendation:** Pass `slug` into the helper (already available
on the SELECT side; widen the `.returning({ id })` at line 145 to
also return `slug`) and interpolate it into the summary.

### [S-008] `hashRequestBody` collides on `undefined` vs missing keys — JSON.stringify drops undefined-valued keys silently
**Where:** `apps/backend/src/modules/core/idempotency/canonicalize.ts:11-23`;
exercised by `managed-system-service.ts:238` (`hashRequestBody({ id, ...body })`)
and `analytics-area-service.ts:325` (same).
**Why it matters:** ADR-0015:71-90 mandates the request-hash is the
discriminator between "same logical retry" and "key reuse":
> "If found but the request hash differs (same key, different payload — client bug), returns `409 conflict.idempotency_key_reuse`."

`canonicalizeJson` calls `Object.keys(value).sort()` and recurses, and
`JSON.stringify` drops keys whose value is `undefined`. The Slice 2
update body permits explicit-null (`external_key: null` clears the
column) but the canonicalization treats `{ external_key: undefined }`
and `{}` as the same hash. A retry that flips a field from absent →
explicit-null with the same Idempotency-Key replays the *first*
response verbatim instead of returning 409 mismatch — the inverse of
the bug ADR-0015:76 is designed to detect.
**Recommendation:** In `canonicalizeJson`, encode `undefined` to a
sentinel (e.g. `{ __undef: true }`) before recursing, so the hash
distinguishes "key present with explicit undefined" from "key absent".
Or, equivalently, drop the `?? null` coalescing in the service
update-path hash inputs so explicit nulls and absences hash distinctly.

### [S-009] `listManagedSystems` / `listAnalyticsAreas` run two unparameterized queries that can disagree under concurrent writes
**Where:** `apps/backend/src/modules/managed-systems/managed-system-service.ts:500-511`;
`apps/backend/src/modules/analytics-areas/analytics-area-service.ts:524-534`.
**Why it matters:** Both list services issue `SELECT … LIMIT/OFFSET`
and a separate `SELECT count(*)` against the same WHERE clause on the
outer `db` handle (two connections, two snapshots). A concurrent
register/archive between the two queries returns a page that does not
match the `total`. ADR-0015 does not address read consistency
explicitly, but `docs/implementation/03-api-contracts.md:450-460`
(referenced in ADR-0017) treats the pickers as authoritative — the
admin UI displays "N items" alongside the page and the values can
disagree by ±1 each refresh under active write load.
**Recommendation:** Wrap both selects in a single
`db.transaction(async (tx) => …)` so the page and the count share a
snapshot, or switch to `count(*) OVER ()` as a windowed column on the
paged query (one round-trip, one snapshot).

### [S-010] `core` audit and idempotency services own no AGENTS.md — only stub CLAUDE.md
**Where:** `apps/backend/src/modules/core/CLAUDE.md`;
no `apps/backend/src/modules/core/audit/AGENTS.md` or
`apps/backend/src/modules/core/idempotency/AGENTS.md`.
**Why it matters:** AGENTS.md (repo root):
> "Match existing docs and implementation patterns before inventing new structure."

The permissions module ships `AGENTS.md` with module-local rules; the
core audit/idempotency owners (which the entire Slice 2 surface depends
on — every MS/AA call site imports them) carry only the pointer-stub
CLAUDE.md. A future reviewer touching the audit-service or
idempotency-service has no narrowed rule surface to consult and must
re-read the top-level AGENTS.md. Not a code defect; a documentation
asymmetry that ADR-0008's role-separation discipline arguably deserves.
**Recommendation:** Add `apps/backend/src/modules/core/AGENTS.md` (or
two narrower files under `audit/` and `idempotency/`) that pin the
two invariants S-002 and S-006 surface: audit/idempotency `record`
takes a tx, never a pool; tx must be the *same* tx as the mutation.

## Verified clean

- `auditService.record` correctly validates `event_type` against the
  closed Zod enum and the per-event detail schema on every call
  (audit-service.ts:40-43); a programmer error in the calling service
  (wrong event_type, malformed detail) throws inside the tx and aborts
  the mutation — the audit row cannot commit without a matching
  domain mutation.
- Every Slice 2 mutation emits its audit row via the same `tx` handle
  it used for the domain INSERT/UPDATE
  (managed-system-service.ts:201,354,462; analytics-area-service.ts:148,288,400),
  satisfying ADR-0008:7 "the business mutation and its audit row
  commit in one transaction" at the Drizzle-call-site level (the type
  bridge S-006 raises is the loose surface, not a missed call).
- MS archive cascade visits children in a single tx with the same
  `now` timestamp (managed-system-service.ts:439-460) and reports
  `cascaded_analytics_area_ids` consistently in both the parent
  audit row and the response body — satisfies ADR-0017:84
  "the cascading MS archive also records a `cascaded_analytics_area_ids`
  array in its own detail payload, so a single BI query can pivot from
  either direction."
- `cascadeArchiveActiveChildren` skips already-archived rows via the
  `isNull(analyticsAreas.archivedAt)` predicate (analytics-area-service.ts:142),
  so re-running the cascade is idempotent at the row level.
- MS archive on an already-archived row short-circuits without
  emitting a second audit row and without re-walking the cascade
  (managed-system-service.ts:424-437) — ADR-0017:83 "Empty `changes`
  is forbidden — a PATCH that changes nothing returns 200 without
  writing an audit row" applies by analogy.
- Both `*_updated` paths write an audit row only when at least one
  field changed (managed-system-service.ts:310-323;
  analytics-area-service.ts:375-388), satisfying ADR-0017:83 verbatim.
- `idempotency-service.record` uses `onConflictDoNothing` on the
  `(actor_id, key)` PK (idempotency-service.ts:79-90), correctly closing
  Slice-1 F-005's idempotency-row-insert race even though the
  domain-table-insert race (S-001) remains.
- Repository purity: every service writes only tables owned by its
  module — `managed-system-service` touches only `managedSystems`,
  `analytics-area-service` touches only `analyticsAreas`,
  `request-service` touches only `permissionRequests`, plus the
  shared `core.audit_log` and `core.idempotency_keys` writes that
  go through the dedicated Core services. Satisfies
  docs/implementation/02-domain-module-boundaries.md:63 "A module
  may write only its owned tables."
- All error throws use the closed `ERROR_CODES` enum
  (managed-system-service.ts:125,138,144,165,188,194,268,337,351,403,419,447;
  analytics-area-service.ts:116,210,229,250,254,274,280,338,354,397,459,492;
  request-service.ts:91,103,127,141,173,184); no raw strings reach
  the HTTP layer through the service surface.
- `core.jobs/idempotency-purge` and `core.jobs/rate-limits-purge`
  correctly avoid `pgboss.create_queue` (F-010 / ADR-0008) by
  asserting the queue was pre-created in a migration and surfacing
  a typed bootstrap error otherwise (idempotency-purge.ts:62-67;
  rate-limits-purge.ts:60-65).
- Job handlers emit no audit rows for cache eviction
  (idempotency-purge.ts:7-11; rate-limits-purge.ts:10-15), correctly
  reading ADR-0008's audit_log scope as *domain* mutations only.
- `createDb` accepts the URL explicitly so callers can't accidentally
  pick up the wrong role from process.env (db/client.ts:7); satisfies
  ADR-0008's role-separation discipline at the client-factory level.

---

Summary:
- Critical: 0
- High: 2 (S-001 idempotent-retry-replay race, S-002 cap-check outside tx)
- Medium: 4 (S-003 archived-row mutation, S-004 register-vs-cascade race, S-005 check-service step-5 comment lie, S-006 tx-as-Db cast surface)
- Low: 4 (S-007 cascade audit summary, S-008 undefined-key hash collision, S-009 list-page/count snapshot drift, S-010 missing core AGENTS.md)

Verdict: The Slice 2 mutation contract is structurally faithful to
ADR-0008 (audit-in-tx) and the F-005-style idempotency-row fix —
but the same retry-replay guarantee ADR-0015:73-77 promises is
defeated one level out at the domain-table unique index (S-001),
and capability checks run on the outer pool while the mutation runs
on the inner tx (S-002); both should land before Slice 3 imports
MS-scoped grant paths against these services.
