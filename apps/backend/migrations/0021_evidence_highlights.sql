-- Issue #124: Slice 5 Evidence Highlights backend.
-- Adds finding.evidence_highlights and widens entity_links to allow
-- VOC->Finding evidence_of links for additional evidence.

CREATE TABLE "finding"."evidence_highlights" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "core"."workspaces"("id"),
  "finding_id" uuid NOT NULL REFERENCES "finding"."findings"("id"),
  "primary_managed_system_id" uuid NOT NULL REFERENCES "core"."managed_systems"("id"),
  "source_type" text NOT NULL,
  "source_id" uuid,
  "quote_or_summary" text NOT NULL,
  "analytics_area_id" uuid REFERENCES "core"."analytics_areas"("id"),
  "sentiment" text,
  "importance" text,
  "created_by" uuid NOT NULL REFERENCES "core"."actors"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "evidence_highlights_source_type_check"
    CHECK ("source_type" IN ('voc','survey_response','note')),
  CONSTRAINT "evidence_highlights_source_id_required_check"
    CHECK ("source_type" = 'note' OR "source_id" IS NOT NULL),
  CONSTRAINT "evidence_highlights_sentiment_check"
    CHECK ("sentiment" IS NULL OR "sentiment" IN ('negative','neutral','positive')),
  CONSTRAINT "evidence_highlights_importance_check"
    CHECK ("importance" IS NULL OR "importance" IN ('low','medium','high'))
);
--> statement-breakpoint

CREATE INDEX "evidence_highlights_workspace_finding_idx"
  ON "finding"."evidence_highlights" ("workspace_id", "finding_id");
--> statement-breakpoint

GRANT ALL ON "finding"."evidence_highlights" TO fops_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "finding"."evidence_highlights" TO fops_app;
--> statement-breakpoint

ALTER TABLE "core"."entity_links"
  DROP CONSTRAINT IF EXISTS "entity_links_tuple_check";
--> statement-breakpoint

ALTER TABLE "core"."entity_links"
  ADD CONSTRAINT "entity_links_tuple_check"
  CHECK (("source_type", "target_type", "relation_type") IN (
    ('voc','voc','related_to'),
    ('voc','finding','created_finding'),
    ('voc','finding','evidence_of')
  ));
