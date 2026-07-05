-- Issue #121: Slice 5 Finding foundation and entity-link provider registry.
-- Adds finding.findings and widens core.entity_links via a composite tuple
-- CHECK for exactly VOC->VOC related_to and VOC->Finding created_finding.

CREATE SCHEMA IF NOT EXISTS "finding";
--> statement-breakpoint

GRANT USAGE ON SCHEMA "finding" TO fops_app, fops_migrate;
--> statement-breakpoint
GRANT CREATE ON SCHEMA "finding" TO fops_migrate;
--> statement-breakpoint

CREATE TABLE "finding"."findings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "core"."workspaces"("id"),
  "primary_managed_system_id" uuid NOT NULL REFERENCES "core"."managed_systems"("id"),
  "title" text NOT NULL,
  "summary" text NOT NULL,
  "source_type" text NOT NULL,
  "source_id" uuid,
  "evidence_count" integer NOT NULL DEFAULT 0,
  "severity" text NOT NULL,
  "confidence" text,
  "status" text NOT NULL DEFAULT 'draft',
  "analytics_area_id" uuid REFERENCES "core"."analytics_areas"("id"),
  "linked_task_id" uuid,
  "linked_milestone_id" uuid,
  "created_by" uuid NOT NULL REFERENCES "core"."actors"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "findings_source_type_check"
    CHECK ("source_type" IN ('voc','voc_cluster','survey','manual')),
  CONSTRAINT "findings_source_id_required_check"
    CHECK ("source_type" = 'manual' OR "source_id" IS NOT NULL),
  CONSTRAINT "findings_evidence_count_check"
    CHECK ("evidence_count" >= 0),
  CONSTRAINT "findings_severity_check"
    CHECK ("severity" IN ('low','medium','high','critical')),
  CONSTRAINT "findings_confidence_check"
    CHECK ("confidence" IS NULL OR "confidence" IN ('low','medium','high')),
  CONSTRAINT "findings_status_check"
    CHECK ("status" IN ('draft','active','not_actionable','converted','archived'))
);
--> statement-breakpoint

CREATE INDEX "findings_workspace_managed_system_idx"
  ON "finding"."findings" ("workspace_id", "primary_managed_system_id");
--> statement-breakpoint

GRANT ALL ON "finding"."findings" TO fops_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "finding"."findings" TO fops_app;
--> statement-breakpoint

ALTER TABLE "core"."entity_links"
  DROP CONSTRAINT IF EXISTS "entity_links_relation_type_check",
  DROP CONSTRAINT IF EXISTS "entity_links_source_type_check",
  DROP CONSTRAINT IF EXISTS "entity_links_target_type_check";
--> statement-breakpoint

ALTER TABLE "core"."entity_links"
  ADD CONSTRAINT "entity_links_tuple_check"
  CHECK (("source_type", "target_type", "relation_type") IN (
    ('voc','voc','related_to'),
    ('voc','finding','created_finding')
  ));
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "entity_links_workspace_relation_idx"
  ON "core"."entity_links" ("workspace_id", "relation_type");
