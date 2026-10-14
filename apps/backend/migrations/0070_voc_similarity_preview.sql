CREATE TABLE "voc"."voc_similarity_preview_budgets" (
	"workspace_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"actor_id" uuid,
	"scope_key" text NOT NULL,
	"period" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"used_attempts" integer NOT NULL,
	CONSTRAINT "voc_similarity_preview_budgets_pk" PRIMARY KEY("workspace_id","scope_key","period","window_start"),
	CONSTRAINT "voc_similarity_preview_budgets_scope_ck" CHECK (("voc"."voc_similarity_preview_budgets"."scope"='workspace' AND "voc"."voc_similarity_preview_budgets"."actor_id" IS NULL AND "voc"."voc_similarity_preview_budgets"."scope_key"='workspace') OR ("voc"."voc_similarity_preview_budgets"."scope"='actor' AND "voc"."voc_similarity_preview_budgets"."actor_id" IS NOT NULL AND "voc"."voc_similarity_preview_budgets"."scope_key"="voc"."voc_similarity_preview_budgets"."actor_id"::text)),
	CONSTRAINT "voc_similarity_preview_budgets_period_ck" CHECK ("voc"."voc_similarity_preview_budgets"."period" IN ('minute','day')),
	CONSTRAINT "voc_similarity_preview_budgets_attempts_ck" CHECK ("voc"."voc_similarity_preview_budgets"."used_attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "voc"."voc_similarity_preview_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"primary_managed_system_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"dimensions" integer NOT NULL,
	"embedding_version" integer NOT NULL,
	"outcome" text DEFAULT 'reserved' NOT NULL,
	"reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"vector" vector,
	"vector_expires_at" timestamp with time zone,
	CONSTRAINT "voc_similarity_preview_requests_outcome_ck" CHECK ("voc"."voc_similarity_preview_requests"."outcome" IN ('reserved','succeeded','failed','timed_out','outcome_unknown')),
	CONSTRAINT "voc_similarity_preview_requests_dimensions_ck" CHECK ("voc"."voc_similarity_preview_requests"."dimensions" > 0 AND "voc"."voc_similarity_preview_requests"."embedding_version" > 0),
	CONSTRAINT "voc_similarity_preview_requests_ttl_ck" CHECK ("voc"."voc_similarity_preview_requests"."expires_at" <= "voc"."voc_similarity_preview_requests"."reserved_at" + interval '24 hours' AND ("voc"."voc_similarity_preview_requests"."vector_expires_at" IS NULL OR "voc"."voc_similarity_preview_requests"."vector_expires_at" <= "voc"."voc_similarity_preview_requests"."reserved_at" + interval '10 minutes'))
);
--> statement-breakpoint
ALTER TABLE "voc"."voc_similarity_preview_budgets" ADD CONSTRAINT "voc_similarity_preview_budgets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voc"."voc_similarity_preview_budgets" ADD CONSTRAINT "voc_similarity_preview_budgets_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voc"."voc_similarity_preview_requests" ADD CONSTRAINT "voc_similarity_preview_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voc"."voc_similarity_preview_requests" ADD CONSTRAINT "voc_similarity_preview_requests_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voc"."voc_similarity_preview_requests" ADD CONSTRAINT "voc_similarity_preview_requests_primary_managed_system_id_managed_systems_id_fk" FOREIGN KEY ("primary_managed_system_id") REFERENCES "core"."managed_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "voc_similarity_preview_requests_key_uq" ON "voc"."voc_similarity_preview_requests" USING btree ("workspace_id","actor_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "voc_similarity_preview_requests_expiry_idx" ON "voc"."voc_similarity_preview_requests" USING btree ("expires_at");--> statement-breakpoint
-- Only these two operational tables receive new app DELETE privileges.
GRANT SELECT, INSERT, UPDATE, DELETE ON voc.voc_similarity_preview_requests, voc.voc_similarity_preview_budgets TO fops_app;
--> statement-breakpoint
CREATE FUNCTION voc.guard_similarity_preview_request_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  IF current_user = 'fops_app' AND OLD.expires_at > statement_timestamp() THEN
    RAISE EXCEPTION 'only expired preview tombstones may be reclaimed' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION voc.guard_similarity_preview_request_delete() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER similarity_preview_request_retention BEFORE DELETE ON voc.voc_similarity_preview_requests
FOR EACH ROW EXECUTE FUNCTION voc.guard_similarity_preview_request_delete();
--> statement-breakpoint
CREATE FUNCTION voc.guard_similarity_preview_budget_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  IF current_user = 'fops_app' AND OLD.window_start +
      (CASE OLD.period WHEN 'minute' THEN interval '1 minute' ELSE interval '1 day' END) > statement_timestamp() THEN
    RAISE EXCEPTION 'only ended preview budget windows may be reclaimed' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION voc.guard_similarity_preview_budget_delete() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER similarity_preview_budget_retention BEFORE DELETE ON voc.voc_similarity_preview_budgets
FOR EACH ROW EXECUTE FUNCTION voc.guard_similarity_preview_budget_delete();
--> statement-breakpoint
INSERT INTO pgboss.queue (name, policy, retry_limit, retry_delay, retry_backoff, retry_delay_max, expire_seconds, retention_seconds, deletion_seconds, warning_queued, dead_letter, partition, table_name, heartbeat_seconds)
VALUES ('voc.similarity_preview_cleanup', 'standard', 5, 30, true, NULL, 900, 1209600, 604800, 0, NULL, false, 'job_common', NULL)
ON CONFLICT DO NOTHING;
