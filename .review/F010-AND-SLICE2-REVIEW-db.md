# DB & Migration adversarial review (commits a062062..HEAD)

Scope: migrations 0000-0007, `meta/_journal.json`, `apps/backend/src/db/schema/*`,
`apps/backend/src/seed/index.ts`, `apps/backend/drizzle.config.ts`. Authority order
applied: AGENTS.md → CONTEXT.md / docs/design → ADR-0008/0009/0015/0017/0018 →
docs/implementation/04-database-and-migrations.md.

## Critical

_(none)_

## High

### [DB-001 missing-fk-indexes-slice2-registry]
**Where:** `apps/backend/migrations/0005_slice2_registry.sql:41-52, 86-97, 113-141`
(no index on `core.teams.archived_by_actor_id`, `core.managed_systems.default_owner_actor_id`,
`default_owner_team_id`, `archived_by_actor_id`, `core.analytics_areas.owner_team_id`,
`archived_by_actor_id`).
**Why it matters:** ADR-0015:57 states verbatim:

> "Every foreign-key column gets its own index unless a covering composite already exists."

None of these six FK columns has a covering composite. The two composites that
exist on `analytics_areas` lead with `workspace_id` and `managed_system_id` —
neither helps a `WHERE owner_team_id = $1` or `WHERE archived_by_actor_id = $1`
read path. The same omission caused the F-003 follow-up on Slice 1 permission
tables; the Slice 2 migration is repeating it on the new registry tables.
The cost of fixing this later is non-zero because every reverse-pivot query
("which MSs does this actor own by default?", "which AAs are routed to team X?")
must full-scan until then, and the join-via-team-id pivot is a routing query
Slice 3 default-owner resolution will hit immediately.
**Recommendation:** Add btree indexes on each of the six FK columns in 0005
(or in a follow-up 0008). Workspace-id-first composites where the read path
will always carry workspace_id (`(workspace_id, default_owner_team_id)` etc.)
satisfy ADR-0015:58 "every `(workspace_id, …)` query path starts with `workspace_id`".

### [DB-002 missing-fk-indexes-permission-managed-system]
**Where:** `apps/backend/migrations/0006_permission_managed_system_fks.sql:14-27`
(no btree index on the three newly-FK'd `managed_system_id` columns).
**Why it matters:** Same ADR-0015:57 clause as DB-001. The existing
`permission_grants_active_uq` partial unique index has `managed_system_id` as
its 4th column behind `workspace_id, actor_id, capability`, so a lookup
"find every grant scoped to MS X" (a hard requirement for the
`managed_system_archived` cascade Slice 3 will need to revoke or warn about
dangling grants) cannot use it. The denies and requests tables have the same
gap. The Slice 2 #9 commit message references "permission FKs"; landing the
referential constraint without the index is half the contract.
**Recommendation:** Add `CREATE INDEX … ON permission.permission_grants
(workspace_id, managed_system_id)` (and sibling indexes on denies and
requests) in 0006 or a follow-up.

## Medium

### [DB-003 adr-0018-internal-contradiction-teams-grants]
**Where:** `apps/backend/migrations/0005_slice2_registry.sql:147,153`
grants `SELECT, INSERT, UPDATE, DELETE ON core.teams TO fops_app`.
**Why it matters:** ADR-0018:23 says

> "Standard role grants: `fops_app` gets SELECT/INSERT/UPDATE/DELETE; `fops_migrate` retains ALL."

But ADR-0018:39 says

> "`fops_app` cannot INSERT/UPDATE/DELETE on `core.teams` for normal product flows because no Slice 2 application service touches it."

The migration follows line 23. The ADR contradicts itself. The defensive
reading of "placeholder" (no service writes) argues fops_app should hold
SELECT only until the future teams slice adds the CRUD surface; the current
grants leave a writeable surface no service is supposed to reach. This is not
a code bug per se but a documented-policy drift that will reopen at the
review for the next slice that touches teams.
**Recommendation:** Either (a) tighten the migration to `GRANT SELECT ON core.teams TO fops_app`
and update ADR-0018:23 to "SELECT only until the teams management slice ships",
or (b) keep the current full-DML grant and remove the ADR-0018:39 claim that
fops_app cannot mutate teams. Decide before the next slice imports `teams`.

### [DB-004 0007-shim-relies-on-implicit-function-owner]
**Where:** `apps/backend/migrations/0007_pgboss_create_queue_shim.sql:42-64`.
**Why it matters:** The shim is `SECURITY DEFINER` and delegates to
`pgboss._create_queue_unsafe`, which has DDL side-effects when called with
`partition := true`. `SECURITY DEFINER` runs with the *owner's* privileges,
so the shim's safety depends on the function being owned by `fops_migrate`
(the role with DDL rights) and never by a less-privileged role. The migration
neither asserts that owner via `ALTER FUNCTION … OWNER TO fops_migrate` nor
checks it. On any deployment where the migration job runs as a different
high-privilege role (e.g., a temporary `postgres` superuser used for bootstrap),
the wrapper inherits that owner instead of `fops_migrate`, and a future
operator script that re-owns or re-runs migrations as a different role can
silently shift the definer. The ADR-0008 contract ("only fops_migrate may DDL")
is enforced today by convention, not by the migration.
**Recommendation:** Add `ALTER FUNCTION pgboss.create_queue(text, jsonb) OWNER TO fops_migrate;`
and `ALTER FUNCTION pgboss._create_queue_unsafe(text, jsonb) OWNER TO fops_migrate;`
to 0007 immediately after the function is recreated. This makes the SECURITY
DEFINER target explicit and deployment-invariant.

### [DB-005 rate_limits-grants-asymmetric-with-0005-pattern]
**Where:** `apps/backend/migrations/0001_jazzy_miracleman.sql:14`
(grants only `fops_app`, omits explicit `GRANT ALL … TO fops_migrate`).
**Why it matters:** Migration 0005 (lines 148-150) sets the canonical pattern:
each new table receives both `GRANT ALL … TO fops_migrate` and the narrower
fops_app grant. 0001 grants only fops_app. The migration runs as fops_migrate
and the role owns the new `core.rate_limits` table via ownership, so this is
functionally green today — but the asymmetry breaks the "every migration adds
both grants" pattern that ADR-0008:30 leans on ("Migrations enforce the grant
in code so a future schema change cannot silently widen access."). If a future
operator script reassigns `core.rate_limits` ownership (e.g., during a
schema-import recovery), fops_migrate loses access until a re-grant.
**Recommendation:** Add `GRANT ALL ON "core"."rate_limits" TO fops_migrate;`
to 0001 (or to a small follow-up migration) to match the 0005 pattern.

## Low

### [DB-006 0007-partition-guard-case-sensitive]
**Where:** `apps/backend/migrations/0007_pgboss_create_queue_shim.sql:58`
(`IF options->>'partition' = 'true' THEN`).
**Why it matters:** The guard is a literal string compare against lowercase
`'true'`. JSON booleans serialize to lowercase, and pg-boss v12.18.2 only
ever passes a JSON boolean, so this is fine in practice. But a caller that
hand-builds the JSON as `{"partition": "True"}` (capital T, valid JSON
string) passes the guard and reaches `_create_queue_unsafe` with the
elevated definer rights — the partition branch then triggers because pg-boss
internally also uses `->>`. This is a 1-line hardening, not a bug today.
**Recommendation:** Compare on `(options->>'partition')::bool IS TRUE`,
or `lower(options->>'partition') = 'true'`. Either form closes the
case-sensitive parsing surface without changing the happy path.

### [DB-007 partial-unique-actors-no-archive-predicate]
**Where:** `apps/backend/src/db/schema/core.ts:65-69`,
`apps/backend/migrations/0000_familiar_centennial.sql:115-116` (the
`actors_workspace_external_id_uq` and `actors_workspace_email_uq` indexes
are full unique, not partial-on-archived).
**Why it matters:** `core.actors` has no `archived_at` column today, so
this is purely consistent with the table shape. Worth a future-facing nit:
if Slice 3 introduces actor archival (the ADR-0017 archive pattern is now
established for MS/AA/teams; actors are the natural next adopter), the
full unique on `(workspace_id, external_id)` blocks re-onboarding a
previously-archived AD account under the same external_id. No ADR
currently requires this and no slice on the roadmap touches actor archival.
**Recommendation:** None for Slice 2. Note for the slice that lands actor
archival: the partial-unique-on-`archived_at`-null pattern should extend
here to keep external_id reusable.

## Verified clean

- ADR-0008 audit-log append-only: 0000:218-219 grants `SELECT, INSERT` to
  fops_app and explicitly `REVOKE UPDATE, DELETE, TRUNCATE`; no later
  migration re-grants those privileges to fops_app.
- ADR-0008 role separation on pg-boss is complete after 0007: fops_app
  holds EXECUTE only on the SECURITY DEFINER `pgboss.create_queue(text, jsonb)`
  wrapper; PUBLIC is revoked from both wrapper and `_create_queue_unsafe`;
  fops_app does not hold EXECUTE on `_create_queue_unsafe`; fops_app does
  not hold EXECUTE on `pgboss.delete_queue` (0003:87-89).
- Partial unique index predicates are IMMUTABLE in every case
  (0000:137,154,173; 0005:51,96,141) — no `now()`, no `expires_at`
  reference; the file-level comments at 0000:125-128 and 0000:140-143
  explicitly call out that omission and justify enforcement at write time.
- COALESCE wrapping on nullable scope columns is complete in
  `permission_denies_active_uq`, `permission_grants_active_uq`, and
  `permission_requests_active_uq` (0000:129-173) — every nullable column in
  the scope tuple is wrapped with a deterministic sentinel.
- `managed_systems_default_owner_xor_check` (0005:67-68) correctly enforces
  "at most one of (default_owner_actor_id, default_owner_team_id) is non-null"
  per ADR-0018:31 — both-null is permitted as ADR-0018 names it
  ("XOR-or-both-null").
- ADR-0015:58 workspace-id-first composite ordering holds for every new
  Slice 2 index: `analytics_areas_workspace_managed_system_idx` (0005:135),
  `analytics_areas_workspace_ms_slug_active_uq` (0005:138-141),
  `managed_systems_workspace_slug_active_uq` (0005:93-96),
  `teams_workspace_name_active_uq` (0005:48-51).
- `analytics_areas.managed_system_id` is `NOT NULL` (0005:103) per
  ADR-0017:33 and CONTEXT.md:225-228 (AA-belongs-to-exactly-one-MS).
- 0006 FK direction is correct: `permission.* → core.managed_systems`,
  not the reverse. `ON DELETE no action` is consistent with the
  ADR-0017 "archive over hard delete" mandate (MS rows are never
  hard-deleted in MVP).
- `_journal.json` entries 0..7 match the eight on-disk filenames
  (`0000_familiar_centennial`..`0007_pgboss_create_queue_shim`) with
  monotonically increasing `when` and consistent `version: "7"`.
- Seed (`apps/backend/src/seed/index.ts`) runs as fops_app per its own
  contract (line 11) and never touches `core.audit_log`. Workspace and
  actor upserts use `onConflictDoNothing` against the correct unique
  targets; MS and AA inserts pre-check the partial unique scope
  (workspace_id + slug + archived_at IS NULL) before inserting, which
  is the correct idempotent pattern given the partial unique index.
- `drizzle.config.ts` declares `DATABASE_URL_MIGRATE` (fops_migrate
  connection) and explicitly does NOT consult `DATABASE_URL`
  (fops_app), per ADR-0015 migration discipline.
- 0002 grants `USAGE` (not `CREATE`) on `pgboss` schema to fops_app
  (line 342), so even functions without SECURITY DEFINER that would
  attempt `CREATE TABLE pgboss.…` under invoker rights fail before the
  DDL runs.
- pg-boss queue row pre-creation in 0003/0004 uses partition=false
  (`false` literal at column position 12), so even the legacy
  create_queue path that fops_app could reach pre-0007 short-circuited
  on `INSERT … ON CONFLICT DO NOTHING`.

---

Summary:
- Critical: 0
- High: 2 (DB-001, DB-002)
- Medium: 3 (DB-003, DB-004, DB-005)
- Low: 2 (DB-006, DB-007)

Verdict: Slice 2 DB migrations and ADR-0008 role separation are structurally
sound — F-010 is properly closed by 0007's SECURITY DEFINER shim — but the
Slice 2 registry tables ship without ADR-0015-mandated FK indexes (DB-001/002),
and the shim's safety implicitly relies on a function owner the migration
does not assert (DB-004); both are best fixed before Slice 3 lands queries
against these surfaces.
