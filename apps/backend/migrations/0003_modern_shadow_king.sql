-- F-003 + F-010 + idempotency purge queue pre-create.
--
-- Section A (F-003, ADR-0015:55-61): add foreign keys to enforce referential
-- integrity on every workspace_id / actor_id column flagged in
-- .review/SLICE-1-REVIEW.md. The drizzle-kit CJS loader cannot resolve the
-- `.js` extensions that NodeNext requires for cross-file `.ts` imports, so
-- the `permission.*` FKs are declared by hand here rather than via Drizzle's
-- `.references(() => ...)`. The audit_log workspace_id FK IS expressible in
-- the Drizzle schema and is the only auto-generated line at the top of this
-- file. All tables are empty in any non-prod env (Slice 1 seeds only the
-- core actors) so no backfill is required.
--
-- Section B (F-010): revoke EXECUTE on pgboss.create_queue and
-- pgboss.delete_queue from fops_app. ADR-0008's role separation says the
-- running app must not DDL; those two stored functions DDL partition tables.
-- Slice 1 pg-boss usage is exactly one queue (`core.idempotency_purge`) and
-- it is pre-created here so the boot path can downgrade `createQueue` to a
-- no-op (idempotent: pg-boss returns silently when the queue exists).
-- Future queues land via new migrations; the boot path never DDLs.

-- ─── Section A (autogen + hand-edited) ─────────────────────────────────
ALTER TABLE "core"."audit_log" ADD CONSTRAINT "audit_log_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- permission.permission_grants — workspace, actor, granted_by, revoked_by.
ALTER TABLE "permission"."permission_grants"
  ADD CONSTRAINT "permission_grants_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "permission"."permission_grants"
  ADD CONSTRAINT "permission_grants_actor_id_actors_id_fk"
  FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "permission"."permission_grants"
  ADD CONSTRAINT "permission_grants_granted_by_actor_id_actors_id_fk"
  FOREIGN KEY ("granted_by_actor_id") REFERENCES "core"."actors"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "permission"."permission_grants"
  ADD CONSTRAINT "permission_grants_revoked_by_actor_id_actors_id_fk"
  FOREIGN KEY ("revoked_by_actor_id") REFERENCES "core"."actors"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- permission.permission_denies — workspace, actor, created_by, revoked_by.
ALTER TABLE "permission"."permission_denies"
  ADD CONSTRAINT "permission_denies_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "permission"."permission_denies"
  ADD CONSTRAINT "permission_denies_actor_id_actors_id_fk"
  FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "permission"."permission_denies"
  ADD CONSTRAINT "permission_denies_created_by_actor_id_actors_id_fk"
  FOREIGN KEY ("created_by_actor_id") REFERENCES "core"."actors"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "permission"."permission_denies"
  ADD CONSTRAINT "permission_denies_revoked_by_actor_id_actors_id_fk"
  FOREIGN KEY ("revoked_by_actor_id") REFERENCES "core"."actors"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- permission.permission_requests — workspace, requester.
ALTER TABLE "permission"."permission_requests"
  ADD CONSTRAINT "permission_requests_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "permission"."permission_requests"
  ADD CONSTRAINT "permission_requests_requester_actor_id_actors_id_fk"
  FOREIGN KEY ("requester_actor_id") REFERENCES "core"."actors"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- ─── Section B: F-010 pg-boss role tightening ──────────────────────────
-- pgboss.delete_queue is never called by application code (it would tear
-- down a queue + its partition table — pure DDL). Revoke it from fops_app
-- so a future code path cannot accidentally drop a queue. PUBLIC is
-- revoked first because Postgres grants EXECUTE on new functions to
-- PUBLIC by default and fops_app inherits via PUBLIC.
REVOKE EXECUTE ON FUNCTION pgboss.delete_queue(text) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION pgboss.delete_queue(text) FROM fops_app;
--> statement-breakpoint
-- pgboss.create_queue is left grant-EXECUTE-able to fops_app: pg-boss's
-- own scheduler (timekeeper) calls it at start() for the internal
-- `__pgboss__send-it` queue, and its body short-circuits to
-- `INSERT … ON CONFLICT DO NOTHING; RETURN` for any non-partitioned queue
-- that already exists (see migration 0002 function body lines 280-283).
-- All queues used by Core jobs are pre-created in Section C below with
-- partition=false, so calls from fops_app cannot trigger the DDL branch
-- (CREATE TABLE / ATTACH PARTITION). This narrows the practical surface
-- to "row inserts on pgboss.queue" while keeping pg-boss's documented
-- start() path working without a SECURITY DEFINER detour.
--
-- If a future queue needs `partition: true` (per-queue job partition),
-- pre-create it in a new migration as fops_migrate (full DDL rights) and
-- have the app boot path use `boss.getQueues([...])` for verification.

-- ─── Section C: pre-create Core job queues ─────────────────────────────
-- The only queue Slice 1 uses, pre-created here so the boot path verifies
-- existence via `boss.getQueues()` rather than `boss.createQueue()`.
-- Default policy is 'standard' to match `registerIdempotencyPurge`.
-- Column list mirrors the pgboss.create_queue stored function from
-- migration 0002 verbatim. Future Core queues land in their own migration.
INSERT INTO pgboss.queue (
  name,
  policy,
  retry_limit,
  retry_delay,
  retry_backoff,
  retry_delay_max,
  expire_seconds,
  retention_seconds,
  deletion_seconds,
  warning_queued,
  dead_letter,
  partition,
  table_name,
  heartbeat_seconds
) VALUES
  (
    'core.idempotency_purge',
    'standard',
    5, 30, true, NULL, 900, 1209600, 604800, 0, NULL, false, 'job_common', NULL
  )
ON CONFLICT DO NOTHING;
