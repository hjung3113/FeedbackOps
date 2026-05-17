# Slice 2 review follow-ups: archived-row mutation, MS-scope step ordering, teams grants, cascade race lock

`.review/F010-AND-SLICE2-REVIEW-{db,services,http,tests}.md` (2026-05-17) surfaced four locked decisions that ADR-0012, ADR-0017, and ADR-0018 left ambiguous or self-contradictory. This ADR locks the answers. Each section names the original ADR clause it amends and the in-tree commit that lands the change.

This is a follow-up ADR — the originals (0012, 0017, 0018) keep a one-line pointer in their intro section directing readers here for these specific decisions. The originals' other locked decisions remain in force unamended.

## Section A — Archived rows are immutable except via re-registration (amends ADR-0017, ADR-0012)

ADR-0017:65 says archived rows "remain visible on historical records" but does not name a mutation policy. The Slice 2 #10/#11 update services consequently shipped without an `archived_at IS NULL` guard, so a PATCH against an archived `core.managed_systems` or `core.analytics_areas` row mutated the historical record and emitted a misleading `*_updated` audit event (review S-003).

**Locked:** Archived rows are immutable. PATCH against a row whose `archived_at IS NOT NULL` returns `409 conflict.record_archived` from the service layer; no audit row is written. Re-registering the same slug via the partial-unique-after-archive pattern (ADR-0017:63) is the only path to "edit a retired registry entry."

This adds one code to the ADR-0012 closed enum:

```text
conflict.record_archived         → 409
```

The new code joins `conflict.duplicate_slug` and `conflict.parent_archived` under the Slice 2 #10/#11 conflict family. The two existing codes retain their meaning:

- `conflict.parent_archived` — operation rejected because the *referenced parent* is archived (e.g. registering an AA whose `managed_system_id` points at an archived MS).
- `conflict.record_archived` — operation rejected because *the row itself* is archived (e.g. PATCH against an archived MS).

The Slice 2 AA-register path already emits `conflict.parent_archived` when the parent MS is archived. Section D below extends the AA *update* path to emit the same code on the same condition.

**Alternatives rejected:**

- Reusing `conflict.parent_archived` for both meanings was rejected because the two surfaces have different operator remediation paths (re-register under a different parent vs. re-register under the same slug), and clients that pattern-match on the code lose the ability to distinguish them.
- Keeping the current "archived rows are admin-mutable" behaviour was rejected because the historical-record promise in ADR-0017:65 collapses when downstream consumers (VOC, Finding, Task, Survey) join through the UUID and observe a `name` that changed *after* the row was archived. The audit-log entry exists but the join surfaces only the latest state.

## Section B — Cascade-race recovery: PATCH rejected, standalone archive allowed (amends ADR-0017)

Section A's "archived rows are immutable" rule answers the policy for rows that *are themselves* archived. ADR-0017:58 leaves open what to do when an Analytics Area is `archived_at IS NULL` but its parent Managed System is `archived_at IS NOT NULL` — a state that should be impossible per the cascade contract but can be produced by the `READ COMMITTED` register-vs-cascade race documented in review S-004, by direct SQL, or by future code paths that bypass the service layer (review H2).

**Locked:**

- **Q1 — PATCH on an active AA under an archived parent MS returns `409 conflict.parent_archived`.** The AA's metadata is part of the same historical record the parent's archive freezes. Operators who need to fix a typo on a retired-system AA re-register the AA under a different (active) parent, which is rare enough that the friction is acceptable.
- **Q2 — Standalone `POST /analytics-areas/:id/archive` on an active AA under an archived parent MS is permitted.** This is the only first-class path that operators have to clean up a row produced by the race. Re-running the parent MS archive is a no-op (idempotency short-circuits before the cascade re-walks), so refusing the standalone archive would leave the row reachable only via direct SQL.
- **Q3 — Unarchive is deferred.** No `POST /:id/unarchive` endpoint on MS or AA in Slice 2 or Slice 3. Operators who archived in error use slug reuse: re-register under the same slug, which creates a new active row with a new UUID per ADR-0017:63. A future slice may revisit unarchive — see "Reopening triggers" at the bottom of this ADR.

Section E below adds the lock that makes Q1/Q2 mostly hypothetical in production: a `SELECT … FOR UPDATE` on the parent MS row at AA register/update/archive serialises against the parent's archive transaction. The Q1/Q2 rules remain in force because manual SQL fix-ups and future code paths still produce the state the lock prevents.

## Section C — `core.teams` grants tighten to SELECT-only (amends ADR-0018)

ADR-0018:23 and ADR-0018:39 contradicted each other. Line 23 declared `fops_app` gets full DML on `core.teams`; line 39 declared `fops_app` cannot mutate `core.teams` because no Slice 2 service writes to it (review DB-003). Migration 0005:153 followed line 23 and shipped the full-DML grant, leaving a writeable surface that no service is supposed to reach — the exact "least privilege drift" ADR-0008 was written to prevent.

**Locked:** `fops_app` gets `SELECT` only on `core.teams` until the future slice that ships team CRUD lands its management service. Migration 0009 revokes `INSERT, UPDATE, DELETE`. ADR-0018:23 is amended in this ADR (line 23 of the original document remains historical context for the original placeholder; readers consult this ADR for the active grant).

The slice that introduces team management restores `INSERT, UPDATE, DELETE` in its own migration alongside the management service. The current `analytics_areas.owner_team_id` / `managed_systems.default_owner_team_id` FK columns are read-only from the application layer and operator-populated via migrations; this is the placeholder pattern ADR-0018:5 already locks.

**Alternatives rejected:**

- Keeping the full-DML grant and deleting ADR-0018:39's "cannot mutate" claim was rejected because the operative principle (`fops_app` holds no privilege the service layer does not use) is the load-bearing half of ADR-0008's role-separation contract, and the placeholder slice is exactly the moment to keep it intact.

## Section D — `check-service.ts` step 5 is now first-class (amends ADR-0017's deferred-to-Slice-3 note via 05-policy)

`docs/implementation/05-permission-policy.md:22-31` lists step 5 ("Check scoped Managed System permission") as a distinct ordered step in the capability check. `check-service.ts` shipped with step 5 left a stub and a block comment claiming MS-scope evaluation was deferred to Slice 3 (lines 13-15, 153-161). But step 3 at lines 130-136 already matched MS-scoped grants when the caller supplied `scope.managed_system_id`, and the `Decision` union's `'managed_system_scope'` variant was never emitted (review S-005). The deferral comment became a lie: MS-scope grant satisfaction was live, just under a different step's branch.

**Locked:** MS-scope grant matching moves to a real step 5 block that emits `{ allow: true, via: 'managed_system_scope', grant_id }`. Step 3 evaluates *workspace-wide* grants only (`row.managedSystemId === null`). The 05-policy ordering is restored. The frontend `PermissionGate` and the state-mapper that turn `Decision` into UI state already declare `'managed_system_scope'` in their discriminating types; this ADR makes the path real instead of dead.

The Slice 3 work that activates "MS-scoped grants count toward workspace-wide capability checks for MS-eligible capabilities" is unrelated and remains in Slice 3 — that is the *fallback* direction (workspace check satisfied by an MS-scoped grant). The change in this ADR is the *forward* direction (the caller explicitly passes `scope.managed_system_id` and a matching MS-scoped grant satisfies it).

**Alternatives rejected:**

- Leaving the code as-is and amending the comments + dropping the unused `'managed_system_scope'` variant was rejected because the Decision union's shape is already consumed by the audit/state-mapper layer with the assumption that the variant will eventually emit; reverting the type to remove it now and re-adding it in Slice 3 is a two-step rename that the call sites have to absorb twice.

## Section E — `SELECT … FOR UPDATE` on parent MS at AA register / update / archive (amends ADR-0017 cascade narrative)

ADR-0017:58 locks the cascade transaction. Review S-004 documents the race window the `READ COMMITTED` snapshot leaves: a parallel `archiveManagedSystem` transaction commits between the AA-register-tx's parent lookup and the AA INSERT, producing an active AA under an archived parent (the exact state Section B's Q1/Q2 rules cover).

**Locked:** The AA register, update, and archive services obtain a `SELECT … FOR UPDATE` on the parent MS row inside the same transaction as the AA mutation. The MS archive transaction's existing `UPDATE managed_systems SET archived_at = …` naturally takes a row-level write lock on the same row, so the two paths serialise at the parent row. Whichever transaction acquires the lock first wins; the loser observes the post-commit state when it resumes and either succeeds (parent still active) or fails (parent now archived, `conflict.parent_archived`).

`FOR UPDATE` is chosen over `FOR SHARE` because the AA register/update paths conceptually *mutate state that depends on the parent* and the additional contention vs. unrelated read traffic is negligible at MVP scale.

The lock does not eliminate Section B's Q1/Q2 cases — a row produced by manual SQL or by a future code path that bypasses the service layer still requires the documented recovery policy. The lock makes the race-induced occurrence vanishingly rare in the service-driven happy path.

## Reopening triggers

- A slice introduces unarchive (Section B Q3). This ADR's Q3 deferral is reopened by that slice's prologue.
- The team CRUD slice ships. Section C's SELECT-only grant on `core.teams` is reopened by that slice's migration; the placeholder narrative in ADR-0018:7-46 is preserved.
- A second non-MS scope class is added to capability checks (e.g. team-scoped grants). Section D's step-5 shape is reopened to accommodate the new scope discriminator on `Decision`.
- A different concurrency strategy (advisory locks, serializable isolation) becomes preferable for the cascade race (Section E). The reopen narrows to AA register/update/archive lock acquisition only.

## In-tree commit map

| Section | Commits | Files |
|---|---|---|
| A | record_archived code + MS/AA update guards + ADR pointers | `packages/shared/src/errors/codes.ts`, `apps/backend/src/modules/managed-systems/managed-system-service.ts`, `apps/backend/src/modules/analytics-areas/analytics-area-service.ts`, integration tests |
| B | AA update parent-archived guard + tests | `apps/backend/src/modules/analytics-areas/analytics-area-service.ts`, integration tests |
| C | migration 0009 + role-grants test | `apps/backend/migrations/0009_*.sql`, `apps/backend/migrations/meta/_journal.json`, `apps/backend/src/db/__tests__/role-grants.integration.test.ts` |
| D | check-service step 5 + state-mapper + tests | `apps/backend/src/modules/permissions/check-service.ts`, state-mapper, `check-service.test.ts` |
| E | FOR UPDATE on parent MS + race test | `apps/backend/src/modules/analytics-areas/analytics-area-service.ts`, integration test |
