-- ADR-0066: deploy before grant writers. No provenance backfill or role grants.
-- Once predecessors are superseded, restoring the old predicate can violate
-- uniqueness. Roll back through a forward fix or explicit history-preserving
-- operator disposition; never revive or fake-revoke historical grants.
DROP INDEX "permission"."permission_grants_active_uq";--> statement-breakpoint
ALTER TABLE "permission"."permission_grants" ADD COLUMN "superseded_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "permission_grants_active_uq"
  ON "permission"."permission_grants"
  USING btree (
    "workspace_id",
    "actor_id",
    "capability",
    coalesce("managed_system_id", '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce("object_type", ''),
    coalesce("object_id", '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE "revoked_at" is null AND "superseded_at" is null;
