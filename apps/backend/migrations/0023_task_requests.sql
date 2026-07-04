-- Issue #132: Slice 6 Task Request tracer bullet.
-- Adds task_request.task_requests and widens core.entity_links so a Finding
-- can request exactly one provenance link to a Task Request.

CREATE SCHEMA IF NOT EXISTS "task_request";
--> statement-breakpoint

GRANT USAGE ON SCHEMA "task_request" TO fops_app, fops_migrate;
--> statement-breakpoint
GRANT CREATE ON SCHEMA "task_request" TO fops_migrate;
--> statement-breakpoint

CREATE TABLE "task_request"."task_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "core"."workspaces"("id"),
  "source_type" text NOT NULL,
  "source_id" uuid NOT NULL,
  "primary_managed_system_id" uuid NOT NULL REFERENCES "core"."managed_systems"("id"),
  "evidence_summary" text NOT NULL,
  "requested_outcome" text NOT NULL,
  "requester_actor_id" uuid NOT NULL REFERENCES "core"."actors"("id"),
  "status" text NOT NULL DEFAULT 'pending_review',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "task_requests_status_check"
    CHECK ("status" IN ('pending_review','approved','rejected','needs_more_evidence','converted')),
  CONSTRAINT "task_requests_source_type_check"
    CHECK ("source_type" IN ('finding','voc','voc_cluster'))
);
--> statement-breakpoint

CREATE INDEX "task_requests_workspace_status_idx"
  ON "task_request"."task_requests" ("workspace_id", "status");
--> statement-breakpoint
CREATE INDEX "task_requests_workspace_source_idx"
  ON "task_request"."task_requests" ("workspace_id", "source_type", "source_id");
--> statement-breakpoint
CREATE INDEX "task_requests_workspace_managed_system_idx"
  ON "task_request"."task_requests" ("workspace_id", "primary_managed_system_id");
--> statement-breakpoint

GRANT ALL ON "task_request"."task_requests" TO fops_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "task_request"."task_requests" TO fops_app;
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
    ('finding','task_request','requested_task')
  ));
