-- Issue #112: Slice 4.1 entity_links VOC↔VOC related_to tracer.
-- Establishes core.entity_links as the canonical polymorphic loose-coupling
-- join table. This slice creates only active VOC -> VOC related_to links;
-- later slices expand relation/status handling and detach transitions.

CREATE TABLE IF NOT EXISTS "core"."entity_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "core"."workspaces"("id"),
  "source_type" text NOT NULL,
  "source_id" uuid NOT NULL,
  "target_type" text NOT NULL,
  "target_id" uuid NOT NULL,
  "relation_type" text NOT NULL,
  "visibility" text NOT NULL DEFAULT 'internal_only',
  "status" text NOT NULL DEFAULT 'active',
  "managed_system_id" uuid NOT NULL REFERENCES "core"."managed_systems"("id"),
  "created_by" uuid NOT NULL REFERENCES "core"."actors"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz,
  CONSTRAINT "entity_links_relation_type_check"
    CHECK ("relation_type" IN ('related_to')),
  CONSTRAINT "entity_links_visibility_check"
    CHECK ("visibility" IN ('internal_only','summary_visible','visible_to_reporter','admin_only')),
  CONSTRAINT "entity_links_status_check"
    CHECK ("status" IN ('active','stale','detached','revoked')),
  CONSTRAINT "entity_links_source_type_check"
    CHECK ("source_type" IN ('voc')),
  CONSTRAINT "entity_links_target_type_check"
    CHECK ("target_type" IN ('voc')),
  CONSTRAINT "entity_links_not_self_check"
    CHECK (NOT ("source_type" = "target_type" AND "source_id" = "target_id"))
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "entity_links_active_unique_idx"
  ON "core"."entity_links"
  ("workspace_id", "source_type", "source_id", "target_type", "target_id", "relation_type")
  WHERE "status" = 'active';
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "entity_links_active_source_idx"
  ON "core"."entity_links" ("workspace_id", "source_type", "source_id")
  WHERE "status" = 'active';
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "entity_links_active_target_idx"
  ON "core"."entity_links" ("workspace_id", "target_type", "target_id")
  WHERE "status" = 'active';
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "entity_links_workspace_ms_status_idx"
  ON "core"."entity_links" ("workspace_id", "managed_system_id", "status");
--> statement-breakpoint

GRANT INSERT, SELECT ON "core"."entity_links" TO fops_app;
