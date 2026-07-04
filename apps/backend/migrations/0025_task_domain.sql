-- Issue #134: Slice 6 Task execution domain and Task Request conversion.
-- Adds task.tasks and widens core.entity_links only for approved-request
-- conversion provenance plus preserved Finding/VOC source context.

CREATE SCHEMA IF NOT EXISTS "task";
--> statement-breakpoint

GRANT USAGE ON SCHEMA "task" TO fops_app, fops_migrate;
--> statement-breakpoint
GRANT CREATE ON SCHEMA "task" TO fops_migrate;
--> statement-breakpoint

CREATE TABLE "task"."tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "core"."workspaces"("id"),
  "primary_managed_system_id" uuid NOT NULL REFERENCES "core"."managed_systems"("id"),
  "title" text NOT NULL,
  "status" text NOT NULL DEFAULT 'backlog',
  "priority" text NOT NULL DEFAULT 'medium',
  "assignee_actor_id" uuid NULL REFERENCES "core"."actors"("id"),
  "due_date" date NULL,
  "milestone_id" uuid NULL,
  "analytics_area_id" uuid NULL REFERENCES "core"."analytics_areas"("id"),
  "source_task_request_id" uuid NULL REFERENCES "task_request"."task_requests"("id"),
  "created_by" uuid NOT NULL REFERENCES "core"."actors"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "tasks_status_check"
    CHECK ("status" IN ('backlog','todo','doing','review','done','released','reopened')),
  CONSTRAINT "tasks_priority_check"
    CHECK ("priority" IN ('low','medium','high','urgent'))
);
--> statement-breakpoint

CREATE INDEX "tasks_workspace_status_idx"
  ON "task"."tasks" ("workspace_id", "status");
--> statement-breakpoint
CREATE INDEX "tasks_workspace_managed_system_idx"
  ON "task"."tasks" ("workspace_id", "primary_managed_system_id");
--> statement-breakpoint
CREATE INDEX "tasks_workspace_assignee_idx"
  ON "task"."tasks" ("workspace_id", "assignee_actor_id");
--> statement-breakpoint

GRANT ALL ON "task"."tasks" TO fops_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "task"."tasks" TO fops_app;
--> statement-breakpoint

ALTER TABLE "core"."entity_links"
  DROP CONSTRAINT IF EXISTS "entity_links_tuple_check";
--> statement-breakpoint

ALTER TABLE "core"."entity_links"
  ADD CONSTRAINT "entity_links_tuple_check"
  CHECK (("source_type", "target_type", "relation_type") IN (
    ('voc','voc','related_to'),
    ('voc','finding','created_finding'),
    ('voc','finding','evidence_of'),
    ('voc_cluster','finding','created_finding'),
    ('finding','task_request','requested_task'),
    ('task_request','task','converted_to'),
    ('finding','task','requested_task'),
    ('voc','task','evidence_of')
  ));
