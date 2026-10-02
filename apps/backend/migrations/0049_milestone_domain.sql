-- Issue #514: Milestone domain tables, display id, and FKs.
-- Status has no CHECK constraint: the persisted status set is the open
-- G-status decision (Accepted ADR required) and lands separately.

CREATE TABLE "task"."milestones" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "core"."workspaces"("id"),
  "display_id" text NOT NULL,
  "primary_managed_system_id" uuid NOT NULL REFERENCES "core"."managed_systems"("id"),
  "title" text NOT NULL,
  "why" text NOT NULL,
  "status" text NOT NULL DEFAULT 'planning',
  "owner_actor_id" uuid NOT NULL REFERENCES "core"."actors"("id"),
  "analytics_area_id" uuid REFERENCES "core"."analytics_areas"("id"),
  "start_date" date NOT NULL,
  "target_date" date NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "core"."actors"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "milestones_workspace_display_id_uq"
  ON "task"."milestones" ("workspace_id", "display_id");
--> statement-breakpoint
CREATE INDEX "milestones_workspace_status_idx"
  ON "task"."milestones" ("workspace_id", "status");
--> statement-breakpoint
CREATE INDEX "milestones_workspace_managed_system_idx"
  ON "task"."milestones" ("workspace_id", "primary_managed_system_id");
--> statement-breakpoint

GRANT ALL ON "task"."milestones" TO fops_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "task"."milestones" TO fops_app;
--> statement-breakpoint

ALTER TABLE "core"."display_counters"
  DROP CONSTRAINT IF EXISTS "display_counters_entity_type_chk";
--> statement-breakpoint
ALTER TABLE "core"."display_counters"
  ADD CONSTRAINT "display_counters_entity_type_chk"
  CHECK ("entity_type" IN ('task','finding','cluster','task_request','survey','milestone'));
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "core"."next_display_id"(p_workspace_id uuid, p_entity_type text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core AS $$
DECLARE v_seq bigint; v_prefix text;
BEGIN
  v_prefix := CASE p_entity_type
    WHEN 'task' THEN 'TASK-' WHEN 'finding' THEN 'FIN-'
    WHEN 'cluster' THEN 'CLU-' WHEN 'task_request' THEN 'REQ-'
    WHEN 'survey' THEN 'SRV-' WHEN 'milestone' THEN 'MLS-' ELSE NULL END;
  IF v_prefix IS NULL THEN RAISE EXCEPTION 'unknown entity_type: %', p_entity_type; END IF;
  INSERT INTO core.display_counters (workspace_id, entity_type)
  VALUES (p_workspace_id, p_entity_type) ON CONFLICT (workspace_id, entity_type) DO NOTHING;
  UPDATE core.display_counters SET next_value = next_value + 1
   WHERE workspace_id = p_workspace_id AND entity_type = p_entity_type
   RETURNING next_value - 1 INTO v_seq;
  RETURN v_prefix || v_seq::text;
END; $$;
--> statement-breakpoint
ALTER FUNCTION "core"."next_display_id"(uuid, text) OWNER TO fops_migrate;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "core"."next_display_id"(uuid, text) TO fops_app;
--> statement-breakpoint

-- Abort if any row already carries a non-null milestone reference: adding the
-- FKs below would either fail on dangling uuids or silently bless them.
DO $$
DECLARE
  v_task_milestone_rows bigint;
  v_finding_milestone_rows bigint;
BEGIN
  SELECT count(*) INTO v_task_milestone_rows
    FROM "task"."tasks" WHERE "milestone_id" IS NOT NULL;
  SELECT count(*) INTO v_finding_milestone_rows
    FROM "finding"."findings" WHERE "linked_milestone_id" IS NOT NULL;
  IF v_task_milestone_rows <> 0 OR v_finding_milestone_rows <> 0 THEN
    RAISE EXCEPTION '0049_milestone_domain requires task.tasks.milestone_id and finding.findings.linked_milestone_id to be NULL everywhere: task.tasks non-null rows = %, finding.findings non-null rows = %',
      v_task_milestone_rows, v_finding_milestone_rows;
  END IF;
END;
$$;
--> statement-breakpoint

ALTER TABLE "task"."tasks"
  ADD CONSTRAINT "tasks_milestone_id_milestones_id_fk"
  FOREIGN KEY ("milestone_id") REFERENCES "task"."milestones"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "finding"."findings"
  ADD CONSTRAINT "findings_linked_milestone_id_milestones_id_fk"
  FOREIGN KEY ("linked_milestone_id") REFERENCES "task"."milestones"("id") ON DELETE RESTRICT;
--> statement-breakpoint

CREATE INDEX "tasks_milestone_id_idx" ON "task"."tasks" ("milestone_id")
  WHERE "milestone_id" IS NOT NULL;
