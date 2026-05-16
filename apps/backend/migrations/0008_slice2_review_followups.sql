-- Slice 2 #8 follow-up: adversarial review findings DB-001, DB-002, DB-004,
-- DB-005, DB-006 from `.review/F010-AND-SLICE2-REVIEW-db.md`.
--
-- DB-001 (ADR-0015:57 "every foreign-key column gets its own index unless a
-- covering composite already exists"): Slice 2 #9 shipped the registry
-- tables without FK indexes on six columns. Workspace-id-first composites
-- satisfy ADR-0015:58 simultaneously.
--
-- DB-002 (same ADR-0015:57 clause): Slice 2 #9 added `managed_system_id`
-- FKs on three permission tables without sibling indexes. The future
-- "find every permission row scoped to MS X" cascade query has no
-- supporting index until this lands.
--
-- DB-004 (ADR-0008): migration 0007's SECURITY DEFINER wrapper runs with
-- the *owner*'s privileges. The owner was implicit (whoever ran 0007).
-- Pin it to fops_migrate so a future operator script that re-owns or
-- re-runs migrations as a different role cannot silently shift the
-- definer. Same for the renamed `_create_queue_unsafe`.
--
-- DB-005 (ADR-0008:30 "migrations enforce the grant in code so a future
-- schema change cannot silently widen access"): migration 0001 granted
-- only fops_app on `core.rate_limits` and omitted the symmetric
-- `GRANT ALL … TO fops_migrate`. Functionally green today (the migration
-- runner owns the table) but breaks the "every table gets both grants"
-- pattern that 0005 codified.
--
-- DB-006: 0007's partition guard was a literal lower-case string compare
-- (`= 'true'`). A caller sending `{"partition":"True"}` or
-- `{"partition":1}` slips past the guard while the underlying pg-boss
-- function (which only matches lowercase `'true'`) treats the value as
-- falsy, so no DDL runs today — but the guard should be strict, not
-- coincidentally safe. Rewrite to coerce-and-compare so any
-- partition-truthy value is rejected at the wrapper.

-- ─── DB-001: FK indexes on Slice 2 registry tables ─────────────────────
-- managed_systems
CREATE INDEX "managed_systems_workspace_default_owner_actor_idx"
  ON "core"."managed_systems" USING btree ("workspace_id", "default_owner_actor_id");
--> statement-breakpoint
CREATE INDEX "managed_systems_workspace_default_owner_team_idx"
  ON "core"."managed_systems" USING btree ("workspace_id", "default_owner_team_id");
--> statement-breakpoint
CREATE INDEX "managed_systems_workspace_archived_by_idx"
  ON "core"."managed_systems" USING btree ("workspace_id", "archived_by_actor_id");
--> statement-breakpoint
-- analytics_areas (workspace_id + managed_system_id composite already exists
-- at 0005:135 — covers analytics_areas.managed_system_id reads)
CREATE INDEX "analytics_areas_workspace_owner_team_idx"
  ON "core"."analytics_areas" USING btree ("workspace_id", "owner_team_id");
--> statement-breakpoint
CREATE INDEX "analytics_areas_workspace_archived_by_idx"
  ON "core"."analytics_areas" USING btree ("workspace_id", "archived_by_actor_id");
--> statement-breakpoint
-- teams
CREATE INDEX "teams_workspace_archived_by_idx"
  ON "core"."teams" USING btree ("workspace_id", "archived_by_actor_id");
--> statement-breakpoint

-- ─── DB-002: FK indexes on permission → managed_systems ────────────────
CREATE INDEX "permission_grants_workspace_managed_system_idx"
  ON "permission"."permission_grants" USING btree ("workspace_id", "managed_system_id");
--> statement-breakpoint
CREATE INDEX "permission_denies_workspace_managed_system_idx"
  ON "permission"."permission_denies" USING btree ("workspace_id", "managed_system_id");
--> statement-breakpoint
CREATE INDEX "permission_requests_workspace_requested_managed_system_idx"
  ON "permission"."permission_requests" USING btree ("workspace_id", "requested_managed_system_id");
--> statement-breakpoint

-- ─── DB-005: symmetric fops_migrate grant on core.rate_limits ──────────
GRANT ALL ON "core"."rate_limits" TO fops_migrate;
--> statement-breakpoint

-- ─── DB-004: pin pg-boss function ownership to fops_migrate ────────────
-- The SECURITY DEFINER target must be a DDL-capable role. Implicit
-- ownership is replaced by an explicit ALTER OWNER so deploy scripts
-- that re-create the function under another role are caught at apply
-- time, not at first partitioned-queue creation attempt.
ALTER FUNCTION pgboss.create_queue(text, jsonb) OWNER TO fops_migrate;
--> statement-breakpoint
ALTER FUNCTION pgboss._create_queue_unsafe(text, jsonb) OWNER TO fops_migrate;
--> statement-breakpoint

-- ─── DB-006: strict partition guard in the SECURITY DEFINER shim ───────
-- CREATE OR REPLACE preserves the function OID and the existing EXECUTE
-- grant to fops_app. Behavior change: the guard now rejects any
-- partition value that JSON-coerces to a truthy form (`"true"`, `"True"`,
-- `"TRUE"`, `"t"`, `"1"`, the JSON number `1`, the JSON boolean `true`).
-- The underlying `_create_queue_unsafe` only ever DDLs when its own
-- check `options->>'partition' = 'true'` matches lowercase, so the new
-- guard is strictly tighter — any input the underlying would have DDL'd
-- on is also rejected here, and several adjacent payloads that would
-- have passed silently are now rejected explicitly.
CREATE OR REPLACE FUNCTION pgboss.create_queue(queue_name text, options jsonb)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pgboss, pg_catalog
AS $$
BEGIN
  IF coalesce(lower(options->>'partition'), '') IN ('true', 't', '1') THEN
    RAISE EXCEPTION 'partition=true is not permitted via pgboss.create_queue from fops_app (ADR-0008); pre-create partitioned queues via a Drizzle migration as fops_migrate'
      USING ERRCODE = '42501';
  END IF;
  PERFORM pgboss._create_queue_unsafe(queue_name, options);
END;
$$;
