-- Issue #126: Slice 5 VOC Cluster backend.
-- Adds voc_cluster reference-set tables and widens core.entity_links so a
-- VOC Cluster can create exactly one provenance link to a Finding.

CREATE SCHEMA IF NOT EXISTS "voc_cluster";
--> statement-breakpoint

GRANT USAGE ON SCHEMA "voc_cluster" TO fops_app, fops_migrate;
--> statement-breakpoint
GRANT CREATE ON SCHEMA "voc_cluster" TO fops_migrate;
--> statement-breakpoint

CREATE TABLE "voc_cluster"."voc_clusters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "core"."workspaces"("id"),
  "title" text NOT NULL,
  "summary" text,
  "status" text NOT NULL DEFAULT 'draft',
  "primary_managed_system_id" uuid NOT NULL REFERENCES "core"."managed_systems"("id"),
  "created_by" uuid NOT NULL REFERENCES "core"."actors"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "voc_clusters_status_check"
    CHECK ("status" IN ('draft','confirmed'))
);
--> statement-breakpoint

CREATE INDEX "voc_clusters_workspace_managed_system_idx"
  ON "voc_cluster"."voc_clusters" ("workspace_id", "primary_managed_system_id");
--> statement-breakpoint

CREATE TABLE "voc_cluster"."voc_cluster_members" (
  "cluster_id" uuid NOT NULL REFERENCES "voc_cluster"."voc_clusters"("id"),
  "voc_id" uuid NOT NULL REFERENCES "voc"."vocs"("id"),
  "added_by" uuid NOT NULL REFERENCES "core"."actors"("id"),
  "added_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "voc_cluster_members_pk" PRIMARY KEY ("cluster_id", "voc_id")
);
--> statement-breakpoint

CREATE INDEX "voc_cluster_members_voc_idx"
  ON "voc_cluster"."voc_cluster_members" ("voc_id");
--> statement-breakpoint

GRANT ALL ON "voc_cluster"."voc_clusters" TO fops_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "voc_cluster"."voc_clusters" TO fops_app;
--> statement-breakpoint
GRANT ALL ON "voc_cluster"."voc_cluster_members" TO fops_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "voc_cluster"."voc_cluster_members" TO fops_app;
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
    ('voc_cluster','finding','created_finding')
  ));
