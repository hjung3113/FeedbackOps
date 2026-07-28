-- #143: saved views are private actor preferences, not a shared navigation
-- taxonomy. `surface` names the list contract that is allowed to interpret the
-- JSON payload; `filter_payload` is revalidated against that contract on every
-- write and read, so this table never grants a broader query than its list API.
CREATE TABLE "core"."saved_views" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "core"."workspaces"("id"),
  -- CASCADE deliberately removes a departed actor's private preferences. A
  -- saved view has no value or valid owner without its actor, so SET NULL
  -- would both violate ownership and leave unusable rows behind.
  "actor_id" uuid NOT NULL REFERENCES "core"."actors"("id") ON DELETE CASCADE,
  "surface" text NOT NULL,
  "name" text NOT NULL,
  "filter_payload" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "saved_views_surface_check"
    CHECK ("surface" IN ('voc', 'tasks', 'task_requests', 'findings')),
  CONSTRAINT "saved_views_name_not_blank"
    CHECK (length(btrim("name")) > 0),
  -- Workspace is the outer identity scope; within it, one actor may use the
  -- same display name on different list surfaces, while two same-surface
  -- names would make sidebar selection ambiguous.
  CONSTRAINT "saved_views_workspace_actor_surface_name_uq"
    UNIQUE ("workspace_id", "actor_id", "surface", "name")
);
--> statement-breakpoint
CREATE INDEX "saved_views_workspace_actor_surface_idx"
  ON "core"."saved_views" USING btree ("workspace_id", "actor_id", "surface");
--> statement-breakpoint
GRANT ALL ON "core"."saved_views" TO fops_migrate;
--> statement-breakpoint
-- Private preferences are genuinely full-DML for fops_app: the owner creates,
-- renames, and deletes them. Actor scoping remains an application predicate,
-- because PostgreSQL grants are role-level rather than row-level here.
GRANT SELECT, INSERT, UPDATE, DELETE ON "core"."saved_views" TO fops_app;
