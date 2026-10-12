ALTER TABLE "permission"."permission_requests"
  ADD COLUMN "revision" integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "permission"."permission_requests"
  ADD CONSTRAINT "permission_requests_revision_positive" CHECK ("revision" > 0);
--> statement-breakpoint
ALTER TABLE "permission"."permission_requests"
  DROP CONSTRAINT "permission_requests_status_check";
--> statement-breakpoint
ALTER TABLE "permission"."permission_requests"
  ADD CONSTRAINT "permission_requests_status_check"
  CHECK ("status" IN ('pending','needs_more_info','approved','rejected','expired','revoked','cancelled'));
-- Preserve permission_requests_active_uq and every COALESCE scope/source key.
-- Rollback: prefer a forward fix. Never restore the old CHECK while cancelled
-- history exists. Stop writers, inventory/export rows and revisions, and obtain
-- an explicit operator disposition before dropping revision or restricting status.
