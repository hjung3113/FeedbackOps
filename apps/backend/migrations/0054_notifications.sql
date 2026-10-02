-- Issue #509 part 1: per-Actor notification inbox and transactional dispatch.
CREATE TABLE core.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL CONSTRAINT notifications_workspace_id_workspaces_id_fk REFERENCES core.workspaces(id),
  actor_id uuid NOT NULL CONSTRAINT notifications_actor_id_actors_id_fk REFERENCES core.actors(id),
  event_type text NOT NULL,
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  summary text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id uuid NOT NULL,
  email_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  archived_at timestamptz,
  CONSTRAINT notifications_idempotency_key_uq
    UNIQUE (workspace_id, actor_id, event_type, subject_id, correlation_id)
);
--> statement-breakpoint

CREATE INDEX notifications_workspace_actor_read_created_idx
  ON core.notifications (workspace_id, actor_id, read_at, created_at DESC);
--> statement-breakpoint

GRANT SELECT, INSERT ON core.notifications TO fops_app;
--> statement-breakpoint
GRANT UPDATE (read_at, archived_at, email_sent_at)
  ON core.notifications TO fops_app;
--> statement-breakpoint
GRANT ALL ON core.notifications TO fops_migrate;
--> statement-breakpoint

-- Runtime fops_app cannot perform pg-boss DDL; the queue is migration-owned.
INSERT INTO pgboss.queue (
  name, policy, retry_limit, retry_delay, retry_backoff, retry_delay_max,
  expire_seconds, retention_seconds, deletion_seconds, warning_queued,
  dead_letter, partition, table_name, heartbeat_seconds
) VALUES (
  'notifications.dispatch',
  'standard', 5, 30, true, NULL, 900, 1209600, 604800, 0, NULL, false, 'job_common', NULL
) ON CONFLICT DO NOTHING;
