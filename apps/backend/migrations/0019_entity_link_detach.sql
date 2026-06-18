-- Issue #113: Slice 4.2 entity link soft detach lifecycle.
-- Adds detach metadata to core.entity_links and grants fops_app UPDATE only.
-- Hard delete remains unavailable to the app role; canonical link history is
-- preserved by transitioning active links to status='detached'.

ALTER TABLE "core"."entity_links"
  ADD COLUMN IF NOT EXISTS "detached_by" uuid REFERENCES "core"."actors"("id"),
  ADD COLUMN IF NOT EXISTS "detach_reason" text,
  ADD COLUMN IF NOT EXISTS "detached_at" timestamptz;
--> statement-breakpoint

GRANT UPDATE ON "core"."entity_links" TO fops_app;
