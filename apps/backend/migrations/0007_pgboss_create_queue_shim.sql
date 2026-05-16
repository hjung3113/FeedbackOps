-- F-010 follow-up (issue #8): SECURITY DEFINER shim for pgboss.create_queue.
--
-- ADR-0008 narrative: the running app role (fops_app) must not be able to
-- execute DDL. pg-boss's stored function `pgboss.create_queue(text, jsonb)`
-- DDLs partition tables (CREATE TABLE / ATTACH PARTITION / CREATE INDEX)
-- whenever it is called with `partition := true`. Slice 1 #6 left fops_app
-- with EXECUTE on the raw function because pg-boss's timekeeper invokes it
-- at every `boss.start()` for the internal `__pgboss__send-it` queue.
-- Adversarial review F-010 flagged this as a quiet hole in the role-
-- separation contract.
--
-- Resolution (issue #8 option 1):
--   * Rename the original function to `pgboss._create_queue_unsafe`. Its
--     OID is preserved by the rename, so its existing ownership (fops_migrate)
--     and grants follow it. We then REVOKE EXECUTE from PUBLIC and fops_app
--     so the raw DDL-capable function is reachable only as fops_migrate.
--   * Re-create `pgboss.create_queue(text, jsonb)` with the same signature
--     as a `SECURITY DEFINER` wrapper owned by fops_migrate. The wrapper
--     hard-rejects `partition := true` (raises 42501 insufficient_privilege)
--     and otherwise delegates to `_create_queue_unsafe`. Because the wrapper
--     is `SECURITY DEFINER`, fops_app can call it without holding EXECUTE
--     on the underlying raw function; the partition guard runs before any
--     definer-elevated work happens.
--   * Grant fops_app EXECUTE on the new wrapper only. PUBLIC is revoked
--     first because Postgres grants EXECUTE on new functions to PUBLIC by
--     default (and fops_app inherits via PUBLIC).
--
-- Why same name: pg-boss's `manager.createQueue` (dist/plans.js) always
-- invokes `pgboss.create_queue(name, options)` via that exact SQL signature.
-- A same-name wrapper keeps the boot path working unchanged with no code
-- changes in apps/backend/src/lib/jobs.ts. The internal `__pgboss__send-it`
-- queue is created with default options (QUEUE_DEFAULTS.partition = false
-- in pg-boss v12.18.2's plans.js), so it passes the guard. Core Slice 1/2
-- queues are pre-created in migrations 0003/0004 with partition=false, so
-- their boot-time create_queue calls short-circuit through the original
-- INSERT … ON CONFLICT DO NOTHING; RETURN branch and never DDL.
--
-- Future partitioned queues: pre-create the queue + its partition table in
-- a new migration as fops_migrate, then INSERT into pgboss.queue directly.
-- Do not lift the guard in this wrapper.

ALTER FUNCTION pgboss.create_queue(text, jsonb)
  RENAME TO _create_queue_unsafe;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION pgboss._create_queue_unsafe(text, jsonb) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION pgboss._create_queue_unsafe(text, jsonb) FROM fops_app;
--> statement-breakpoint

CREATE FUNCTION pgboss.create_queue(queue_name text, options jsonb)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pgboss, pg_catalog
AS $$
BEGIN
  IF options->>'partition' = 'true' THEN
    RAISE EXCEPTION 'partition=true is not permitted via pgboss.create_queue from fops_app (ADR-0008); pre-create partitioned queues via a Drizzle migration as fops_migrate'
      USING ERRCODE = '42501';
  END IF;
  PERFORM pgboss._create_queue_unsafe(queue_name, options);
END;
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION pgboss.create_queue(text, jsonb) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION pgboss.create_queue(text, jsonb) TO fops_app;
