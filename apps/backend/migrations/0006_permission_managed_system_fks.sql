-- Slice 2 #9: activate FKs from the permission tables to core.managed_systems.
--
-- Slice 1 (#2) shipped `managed_system_id` / `requested_managed_system_id`
-- as nullable orphan columns because the target table did not yet exist.
-- Migration 0005 lands `core.managed_systems`. This migration adds the
-- referential constraints so a future write with a bogus UUID is rejected
-- at the database boundary, not silently stored.
--
-- The check-service step 5 (MS-scope grant satisfaction) stays no-op per
-- the Slice 2 grill Q5 lock — activation is deferred to Slice 3. The TODO
-- comment in check-service.ts is updated in the same PR to point at the
-- Slice 3 follow-up instead of the Slice 1 #7 cleanup issue.

ALTER TABLE "permission"."permission_grants"
  ADD CONSTRAINT "permission_grants_managed_system_id_managed_systems_id_fk"
  FOREIGN KEY ("managed_system_id") REFERENCES "core"."managed_systems"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "permission"."permission_denies"
  ADD CONSTRAINT "permission_denies_managed_system_id_managed_systems_id_fk"
  FOREIGN KEY ("managed_system_id") REFERENCES "core"."managed_systems"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "permission"."permission_requests"
  ADD CONSTRAINT "permission_requests_requested_managed_system_id_managed_systems_id_fk"
  FOREIGN KEY ("requested_managed_system_id") REFERENCES "core"."managed_systems"("id")
  ON DELETE no action ON UPDATE no action;
