-- #512 choice (a): durable shadow measurements without domain cluster writes.
-- Keep the queue pre-created here; the backend application role has no DDL on pgboss.*.
INSERT INTO pgboss.queue (
  name, policy, retry_limit, retry_delay, retry_backoff, retry_delay_max,
  expire_seconds, retention_seconds, deletion_seconds, warning_queued,
  dead_letter, partition, table_name, heartbeat_seconds
) VALUES (
  'voc.cluster_autogen_shadow',
  'standard', 5, 30, true, NULL, 900, 1209600, 604800, 0, NULL, false, 'job_common', NULL
) ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE TABLE "voc"."voc_cluster_autogen_shadow_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"primary_managed_system_id" uuid NOT NULL,
	"voc_id_low" uuid NOT NULL,
	"voc_id_high" uuid NOT NULL,
	"embedding_version" integer NOT NULL,
	"score" double precision NOT NULL,
	"would_form" boolean NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_run_id" text NOT NULL,
	"seen_count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "voc_cluster_autogen_shadow_candidates_sorted_pair" CHECK ("voc"."voc_cluster_autogen_shadow_candidates"."voc_id_low" < "voc"."voc_cluster_autogen_shadow_candidates"."voc_id_high"),
	CONSTRAINT "voc_cluster_autogen_shadow_candidates_version_positive" CHECK ("voc"."voc_cluster_autogen_shadow_candidates"."embedding_version" > 0),
	CONSTRAINT "voc_cluster_autogen_shadow_candidates_seen_count_positive" CHECK ("voc"."voc_cluster_autogen_shadow_candidates"."seen_count" > 0)
);
--> statement-breakpoint
ALTER TABLE "voc"."voc_cluster_autogen_shadow_candidates" ADD CONSTRAINT "voc_cluster_autogen_shadow_candidates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voc"."voc_cluster_autogen_shadow_candidates" ADD CONSTRAINT "voc_cluster_autogen_shadow_candidates_primary_managed_system_id_managed_systems_id_fk" FOREIGN KEY ("primary_managed_system_id") REFERENCES "core"."managed_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voc"."voc_cluster_autogen_shadow_candidates" ADD CONSTRAINT "voc_cluster_autogen_shadow_candidates_voc_id_low_vocs_id_fk" FOREIGN KEY ("voc_id_low") REFERENCES "voc"."vocs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voc"."voc_cluster_autogen_shadow_candidates" ADD CONSTRAINT "voc_cluster_autogen_shadow_candidates_voc_id_high_vocs_id_fk" FOREIGN KEY ("voc_id_high") REFERENCES "voc"."vocs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "voc_cluster_autogen_shadow_candidates_pair_version_uq" ON "voc"."voc_cluster_autogen_shadow_candidates" USING btree ("workspace_id","voc_id_low","voc_id_high","embedding_version");
--> statement-breakpoint
GRANT ALL ON "voc"."voc_cluster_autogen_shadow_candidates" TO fops_migrate;
--> statement-breakpoint
-- Durable measurement history is readable and upsertable by the worker role;
-- application code cannot erase observations.
GRANT SELECT, INSERT, UPDATE ON "voc"."voc_cluster_autogen_shadow_candidates" TO fops_app;
