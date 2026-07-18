-- Issue #165: durable, VOC-owned review obligations for released Tasks.
-- No trigger writes voc.vocs.reporter_facing_status or voc.voc_public_updates:
-- ADR-0005 requires an explicit later reviewer decision.

CREATE TABLE voc.public_update_review_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES core.workspaces(id),
  voc_id uuid NOT NULL REFERENCES voc.vocs(id),
  source_task_id uuid NOT NULL REFERENCES task.tasks(id),
  source_entity_link_id uuid NOT NULL REFERENCES core.entity_links(id),
  release_event_id uuid NOT NULL,
  correlation_id uuid NOT NULL,
  triggered_by_actor_id uuid NOT NULL REFERENCES core.actors(id),
  status text NOT NULL DEFAULT 'pending',
  resolved_by_actor_id uuid REFERENCES core.actors(id),
  resolved_at timestamptz,
  dismissal_reason text,
  actioned_public_update_id uuid REFERENCES voc.voc_public_updates(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_update_review_candidates_status_check
    CHECK (status IN ('pending', 'dismissed', 'actioned')),
  CONSTRAINT public_update_review_candidates_resolution_check CHECK (
    (status = 'pending'
      AND resolved_by_actor_id IS NULL AND resolved_at IS NULL
      AND dismissal_reason IS NULL AND actioned_public_update_id IS NULL)
    OR (status = 'dismissed'
      AND resolved_by_actor_id IS NOT NULL AND resolved_at IS NOT NULL
      AND dismissal_reason IS NOT NULL AND length(trim(dismissal_reason)) > 0
      AND actioned_public_update_id IS NULL)
    OR (status = 'actioned'
      AND resolved_by_actor_id IS NOT NULL AND resolved_at IS NOT NULL
      AND dismissal_reason IS NULL AND actioned_public_update_id IS NOT NULL)
  )
);
--> statement-breakpoint

-- Terminal candidates are historical review decisions. Resolution-field CHECKs
-- validate each state; this trigger prevents every rewrite of a terminal row,
-- including terminal-to-pending and terminal-to-terminal transitions. A new
-- Task release creates a new row.
CREATE FUNCTION voc.prevent_public_update_review_candidate_terminal_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'public update review candidate terminal state is immutable'
    USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER public_update_review_candidates_terminal_immutable
  BEFORE UPDATE ON voc.public_update_review_candidates
  FOR EACH ROW
  WHEN (OLD.status IN ('dismissed', 'actioned'))
  EXECUTE FUNCTION voc.prevent_public_update_review_candidate_terminal_mutation();
--> statement-breakpoint

CREATE UNIQUE INDEX public_update_review_candidates_release_voc_uq
  ON voc.public_update_review_candidates (workspace_id, release_event_id, voc_id);
--> statement-breakpoint
CREATE UNIQUE INDEX public_update_review_candidates_pending_task_voc_uq
  ON voc.public_update_review_candidates (workspace_id, source_task_id, voc_id)
  WHERE status = 'pending';
--> statement-breakpoint
CREATE INDEX public_update_review_candidates_pending_queue_idx
  ON voc.public_update_review_candidates (workspace_id, status, created_at);
--> statement-breakpoint

GRANT SELECT, INSERT ON voc.public_update_review_candidates TO fops_app;
--> statement-breakpoint

-- Pre-create queue: runtime role must never perform pg-boss DDL.
INSERT INTO pgboss.queue (
  name, policy, retry_limit, retry_delay, retry_backoff, retry_delay_max,
  expire_seconds, retention_seconds, deletion_seconds, warning_queued,
  dead_letter, partition, table_name, heartbeat_seconds
) VALUES (
  'tasks.create_public_update_review_candidates',
  'standard', 5, 30, true, NULL, 900, 1209600, 604800, 0, NULL, false, 'job_common', NULL
) ON CONFLICT DO NOTHING;
