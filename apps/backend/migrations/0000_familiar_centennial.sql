CREATE SCHEMA "core";
--> statement-breakpoint
CREATE SCHEMA "permission";
--> statement-breakpoint
CREATE TABLE "core"."actors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"role_level" text NOT NULL,
	"actor_type" text DEFAULT 'internal_member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "actors_role_level_check" CHECK ("core"."actors"."role_level" in ('admin','developer','user')),
	CONSTRAINT "actors_actor_type_check" CHECK ("core"."actors"."actor_type" in ('internal_member','system'))
);
--> statement-breakpoint
CREATE TABLE "core"."audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"summary" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."idempotency_keys" (
	"actor_id" uuid NOT NULL,
	"key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer NOT NULL,
	"response_body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_actor_id_key_pk" PRIMARY KEY("actor_id","key")
);
--> statement-breakpoint
CREATE TABLE "core"."sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_user_agent_summary" text,
	"created_ip_summary" text
);
--> statement-breakpoint
CREATE TABLE "core"."workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permission"."permission_denies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"managed_system_id" uuid,
	"reason" text NOT NULL,
	"created_by_actor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_actor_id" uuid
);
--> statement-breakpoint
CREATE TABLE "permission"."permission_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"managed_system_id" uuid,
	"object_type" text,
	"object_id" uuid,
	"sensitive_reason" text,
	"granted_by_actor_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by_actor_id" uuid,
	"revoked_reason" text
);
--> statement-breakpoint
CREATE TABLE "permission"."permission_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"requester_actor_id" uuid NOT NULL,
	"requested_capability" text NOT NULL,
	"requested_managed_system_id" uuid,
	"requested_object_type" text,
	"requested_object_id" uuid,
	"reason" text NOT NULL,
	"requested_expiration" timestamp with time zone,
	"source_object_type" text,
	"source_object_id" uuid,
	"source_action_id" text,
	"return_route_intent" text,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."actors" ADD CONSTRAINT "actors_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."audit_log" ADD CONSTRAINT "audit_log_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."idempotency_keys" ADD CONSTRAINT "idempotency_keys_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."sessions" ADD CONSTRAINT "sessions_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."sessions" ADD CONSTRAINT "sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "actors_workspace_idx" ON "core"."actors" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "actors_workspace_external_id_uq" ON "core"."actors" USING btree ("workspace_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "actors_workspace_email_uq" ON "core"."actors" USING btree ("workspace_id","email");--> statement-breakpoint
CREATE INDEX "audit_log_workspace_created_at_idx" ON "core"."audit_log" USING btree ("workspace_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_workspace_subject_created_at_idx" ON "core"."audit_log" USING btree ("workspace_id","subject_type","subject_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_workspace_actor_created_at_idx" ON "core"."audit_log" USING btree ("workspace_id","actor_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_workspace_event_created_at_idx" ON "core"."audit_log" USING btree ("workspace_id","event_type","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idempotency_keys_created_at_idx" ON "core"."idempotency_keys" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sessions_workspace_idx" ON "core"."sessions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "sessions_workspace_actor_idx" ON "core"."sessions" USING btree ("workspace_id","actor_id");--> statement-breakpoint
CREATE INDEX "permission_denies_workspace_actor_idx" ON "permission"."permission_denies" USING btree ("workspace_id","actor_id");--> statement-breakpoint
-- Hand-edited per Slice 1 grill Q5: extend the predicate scope tuple to include
-- managed_system_id, using COALESCE so NULL slots collapse to a sentinel UUID.
-- Drizzle 0.38 cannot express COALESCE inside the index column list, so the
-- generated index is dropped and replaced here.
CREATE UNIQUE INDEX "permission_denies_active_uq"
  ON "permission"."permission_denies"
  USING btree (
    "workspace_id",
    "actor_id",
    "capability",
    coalesce("managed_system_id", '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE "revoked_at" is null;--> statement-breakpoint
CREATE INDEX "permission_grants_workspace_actor_idx" ON "permission"."permission_grants" USING btree ("workspace_id","actor_id");--> statement-breakpoint
CREATE INDEX "permission_grants_workspace_capability_idx" ON "permission"."permission_grants" USING btree ("workspace_id","capability");--> statement-breakpoint
-- Hand-edited per Slice 1 grill Q5: full effective-scope tuple with COALESCE.
-- The expires_at clause is intentionally omitted from the predicate because
-- now() is not IMMUTABLE; expiry is enforced at write time in the permission
-- service.
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
  WHERE "revoked_at" is null;--> statement-breakpoint
CREATE INDEX "permission_requests_workspace_requester_idx" ON "permission"."permission_requests" USING btree ("workspace_id","requester_actor_id");--> statement-breakpoint
CREATE INDEX "permission_requests_workspace_status_idx" ON "permission"."permission_requests" USING btree ("workspace_id","status");--> statement-breakpoint
-- Hand-edited per Slice 1 grill Q7: full requester/capability/scope/source
-- tuple, COALESCE on every nullable column so duplicate active rows are
-- rejected without spurious NULL-distinct gaps.
CREATE UNIQUE INDEX "permission_requests_active_uq"
  ON "permission"."permission_requests"
  USING btree (
    "workspace_id",
    "requester_actor_id",
    "requested_capability",
    coalesce("requested_managed_system_id", '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce("requested_object_type", ''),
    coalesce("requested_object_id", '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce("source_object_type", ''),
    coalesce("source_object_id", '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce("source_action_id", '')
  )
  WHERE "status" in ('pending','needs_more_info');--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────
-- permission_requests.status CHECK constraint per docs/implementation/
-- 05-permission-policy.md lifecycle: pending | needs_more_info | approved |
-- rejected | expired | revoked.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE "permission"."permission_requests"
  ADD CONSTRAINT "permission_requests_status_check"
  CHECK ("status" in ('pending','needs_more_info','approved','rejected','expired','revoked'));--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────
-- Role separation per ADR-0008.
-- fops_migrate owns DDL/DML on every table; this migration is being executed
-- as that role, so it grants USAGE/ALL to itself defensively (idempotent if
-- the role already inherits it via ownership) and then narrows fops_app to
-- the runtime privileges.
--
-- fops_app:
--   * core.audit_log:           INSERT, SELECT only (UPDATE/DELETE revoked).
--   * every other Slice 1 tbl:  INSERT, SELECT, UPDATE, DELETE.
-- ─────────────────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA "core" TO fops_app, fops_migrate;--> statement-breakpoint
GRANT USAGE ON SCHEMA "permission" TO fops_app, fops_migrate;--> statement-breakpoint
GRANT CREATE ON SCHEMA "core" TO fops_migrate;--> statement-breakpoint
GRANT CREATE ON SCHEMA "permission" TO fops_migrate;--> statement-breakpoint

-- Migrate role keeps full DDL/DML on existing tables.
GRANT ALL ON ALL TABLES IN SCHEMA "core" TO fops_migrate;--> statement-breakpoint
GRANT ALL ON ALL TABLES IN SCHEMA "permission" TO fops_migrate;--> statement-breakpoint
GRANT ALL ON ALL SEQUENCES IN SCHEMA "core" TO fops_migrate;--> statement-breakpoint
GRANT ALL ON ALL SEQUENCES IN SCHEMA "permission" TO fops_migrate;--> statement-breakpoint

-- App role: full DML on non-audit tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON "core"."workspaces" TO fops_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "core"."actors" TO fops_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "core"."sessions" TO fops_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "core"."idempotency_keys" TO fops_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "permission"."permission_grants" TO fops_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "permission"."permission_denies" TO fops_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "permission"."permission_requests" TO fops_app;--> statement-breakpoint

-- App role: append-only on the audit log. UPDATE / DELETE / TRUNCATE intentionally
-- withheld and explicitly REVOKE-d below in case a future migration grants them.
GRANT SELECT, INSERT ON "core"."audit_log" TO fops_app;--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "core"."audit_log" FROM fops_app;