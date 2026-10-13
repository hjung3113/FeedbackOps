CREATE SCHEMA "dashboard";
--> statement-breakpoint
CREATE TABLE "survey"."outcome_recovery_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"outcome_recovery_item_id" text NOT NULL,
	"occurrence" integer NOT NULL,
	"resolved_at" timestamp with time zone NOT NULL,
	"outcome" text NOT NULL,
	"evidence" text NOT NULL,
	"action" text,
	"actor_id" uuid,
	CONSTRAINT "outcome_outcome_recovery_history_outcome_check" CHECK ("survey"."outcome_recovery_history"."outcome" IN ('resolved', 'withdrawn')),
	CONSTRAINT "outcome_outcome_recovery_history_evidence_check" CHECK ("survey"."outcome_recovery_history"."evidence" IN ('command', 'observation') AND ("survey"."outcome_recovery_history"."evidence" = 'command' OR ("survey"."outcome_recovery_history"."actor_id" IS NULL AND "survey"."outcome_recovery_history"."action" IS NULL)))
);
--> statement-breakpoint
CREATE TABLE "survey"."outcome_recovery_identities" (
	"workspace_id" uuid NOT NULL,
	"outcome_recovery_item_id" text NOT NULL,
	"category" text NOT NULL,
	"source_id" uuid NOT NULL,
	"managed_system_id" uuid,
	"occurrence" integer NOT NULL,
	"state" text NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outcome_recovery_identities_workspace_id_outcome_recovery_item_id_pk" PRIMARY KEY("workspace_id","outcome_recovery_item_id"),
	CONSTRAINT "outcome_outcome_recovery_identity_occurrence_check" CHECK ("survey"."outcome_recovery_identities"."occurrence" > 0),
	CONSTRAINT "outcome_outcome_recovery_identity_state_check" CHECK ("survey"."outcome_recovery_identities"."state" IN ('active', 'resolved', 'withdrawn'))
);
--> statement-breakpoint
CREATE TABLE "survey"."outcome_recovery_presentations" (
	"workspace_id" uuid NOT NULL,
	"outcome_recovery_item_id" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"occurrence" integer NOT NULL,
	"state" text NOT NULL,
	"snoozed_until" timestamp with time zone,
	CONSTRAINT "outcome_recovery_presentations_workspace_id_outcome_recovery_item_id_actor_id_occurrence_pk" PRIMARY KEY("workspace_id","outcome_recovery_item_id","actor_id","occurrence"),
	CONSTRAINT "outcome_outcome_recovery_presentation_state_check" CHECK (("survey"."outcome_recovery_presentations"."state" IN ('visible', 'muted') AND "survey"."outcome_recovery_presentations"."snoozed_until" IS NULL) OR ("survey"."outcome_recovery_presentations"."state" = 'snoozed' AND "survey"."outcome_recovery_presentations"."snoozed_until" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "dashboard"."recovery_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"recovery_item_id" text NOT NULL,
	"occurrence" integer NOT NULL,
	"resolved_at" timestamp with time zone NOT NULL,
	"outcome" text NOT NULL,
	"evidence" text NOT NULL,
	"action" text,
	"actor_id" uuid,
	CONSTRAINT "recovery_history_outcome_check" CHECK ("dashboard"."recovery_history"."outcome" IN ('resolved', 'withdrawn')),
	CONSTRAINT "recovery_history_evidence_check" CHECK ("dashboard"."recovery_history"."evidence" IN ('command', 'observation') AND ("dashboard"."recovery_history"."evidence" = 'command' OR ("dashboard"."recovery_history"."actor_id" IS NULL AND "dashboard"."recovery_history"."action" IS NULL)))
);
--> statement-breakpoint
CREATE TABLE "dashboard"."recovery_identities" (
	"workspace_id" uuid NOT NULL,
	"recovery_item_id" text NOT NULL,
	"category" text NOT NULL,
	"source_id" uuid NOT NULL,
	"managed_system_id" uuid,
	"occurrence" integer NOT NULL,
	"state" text NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recovery_identities_workspace_id_recovery_item_id_pk" PRIMARY KEY("workspace_id","recovery_item_id"),
	CONSTRAINT "recovery_identity_occurrence_check" CHECK ("dashboard"."recovery_identities"."occurrence" > 0),
	CONSTRAINT "recovery_identity_state_check" CHECK ("dashboard"."recovery_identities"."state" IN ('active', 'resolved', 'withdrawn'))
);
--> statement-breakpoint
CREATE TABLE "dashboard"."recovery_presentations" (
	"workspace_id" uuid NOT NULL,
	"recovery_item_id" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"occurrence" integer NOT NULL,
	"state" text NOT NULL,
	"snoozed_until" timestamp with time zone,
	CONSTRAINT "recovery_presentations_workspace_id_recovery_item_id_actor_id_occurrence_pk" PRIMARY KEY("workspace_id","recovery_item_id","actor_id","occurrence"),
	CONSTRAINT "recovery_presentation_state_check" CHECK (("dashboard"."recovery_presentations"."state" IN ('visible', 'muted') AND "dashboard"."recovery_presentations"."snoozed_until" IS NULL) OR ("dashboard"."recovery_presentations"."state" = 'snoozed' AND "dashboard"."recovery_presentations"."snoozed_until" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "survey"."outcome_recovery_history" ADD CONSTRAINT "outcome_recovery_history_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey"."outcome_recovery_history" ADD CONSTRAINT "outcome_recovery_history_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey"."outcome_recovery_identities" ADD CONSTRAINT "outcome_recovery_identities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey"."outcome_recovery_identities" ADD CONSTRAINT "outcome_recovery_identities_managed_system_id_managed_systems_id_fk" FOREIGN KEY ("managed_system_id") REFERENCES "core"."managed_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey"."outcome_recovery_presentations" ADD CONSTRAINT "outcome_recovery_presentations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey"."outcome_recovery_presentations" ADD CONSTRAINT "outcome_recovery_presentations_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard"."recovery_history" ADD CONSTRAINT "recovery_history_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard"."recovery_history" ADD CONSTRAINT "recovery_history_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard"."recovery_identities" ADD CONSTRAINT "recovery_identities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard"."recovery_identities" ADD CONSTRAINT "recovery_identities_managed_system_id_managed_systems_id_fk" FOREIGN KEY ("managed_system_id") REFERENCES "core"."managed_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard"."recovery_presentations" ADD CONSTRAINT "recovery_presentations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard"."recovery_presentations" ADD CONSTRAINT "recovery_presentations_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "outcome_outcome_recovery_history_occurrence_uq" ON "survey"."outcome_recovery_history" USING btree ("workspace_id","outcome_recovery_item_id","occurrence");--> statement-breakpoint
CREATE INDEX "outcome_outcome_recovery_history_window_idx" ON "survey"."outcome_recovery_history" USING btree ("workspace_id","resolved_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "outcome_outcome_recovery_identity_source_uq" ON "survey"."outcome_recovery_identities" USING btree ("workspace_id","category","source_id");--> statement-breakpoint
CREATE INDEX "outcome_outcome_recovery_identity_scope_idx" ON "survey"."outcome_recovery_identities" USING btree ("workspace_id","managed_system_id","category","state");--> statement-breakpoint
CREATE INDEX "outcome_outcome_recovery_presentation_actor_idx" ON "survey"."outcome_recovery_presentations" USING btree ("workspace_id","actor_id","outcome_recovery_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recovery_history_occurrence_uq" ON "dashboard"."recovery_history" USING btree ("workspace_id","recovery_item_id","occurrence");--> statement-breakpoint
CREATE INDEX "recovery_history_window_idx" ON "dashboard"."recovery_history" USING btree ("workspace_id","resolved_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "recovery_identity_source_uq" ON "dashboard"."recovery_identities" USING btree ("workspace_id","category","source_id");--> statement-breakpoint
CREATE INDEX "recovery_identity_scope_idx" ON "dashboard"."recovery_identities" USING btree ("workspace_id","managed_system_id","category","state");--> statement-breakpoint
CREATE INDEX "recovery_presentation_actor_idx" ON "dashboard"."recovery_presentations" USING btree ("workspace_id","actor_id","recovery_item_id");
--> statement-breakpoint
-- Runtime projection grants are deliberately narrower than migration ownership.
GRANT USAGE ON SCHEMA dashboard TO fops_app, fops_migrate;
GRANT ALL ON dashboard.recovery_identities, dashboard.recovery_history, dashboard.recovery_presentations,
  survey.outcome_recovery_identities, survey.outcome_recovery_history, survey.outcome_recovery_presentations TO fops_migrate;
GRANT SELECT,INSERT,UPDATE ON dashboard.recovery_identities, dashboard.recovery_presentations,
  survey.outcome_recovery_identities, survey.outcome_recovery_presentations TO fops_app;
GRANT SELECT,INSERT ON dashboard.recovery_history, survey.outcome_recovery_history TO fops_app;
--> statement-breakpoint
INSERT INTO pgboss.queue (name,policy,retry_limit,retry_delay,retry_backoff,retry_delay_max,
  expire_seconds,retention_seconds,deletion_seconds,warning_queued,dead_letter,partition,table_name,heartbeat_seconds)
VALUES ('dashboard.recovery_reconcile','standard',5,30,true,NULL,900,1209600,604800,0,NULL,false,'job_common',NULL)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
GRANT CREATE ON SCHEMA survey TO fops_survey_provenance_mutator_owner;
--> statement-breakpoint
-- Uses only the existing provenance mutator's column grants; no existing-table ACL is widened.
CREATE FUNCTION survey.read_finding_recovery_subjects(p_workspace_id uuid,p_finding_id uuid)
RETURNS TABLE(response_id uuid,survey_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT DISTINCT b.response_id,r.survey_id FROM survey.finding_response_bindings b
  JOIN survey.survey_responses r ON r.workspace_id=b.workspace_id AND r.id=b.response_id
  WHERE b.workspace_id=p_workspace_id AND b.finding_id=p_finding_id ORDER BY b.response_id
$$;
ALTER FUNCTION survey.read_finding_recovery_subjects(uuid,uuid) OWNER TO fops_survey_provenance_mutator_owner;
REVOKE ALL ON FUNCTION survey.read_finding_recovery_subjects(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION survey.read_finding_recovery_subjects(uuid,uuid) TO fops_app;
--> statement-breakpoint
CREATE FUNCTION survey.read_outcome_recovery_sources(p_workspace_id uuid,p_survey_id uuid)
RETURNS TABLE(response_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT r.id FROM survey.survey_responses r WHERE r.workspace_id=p_workspace_id AND r.survey_id=p_survey_id ORDER BY r.id
$$;
ALTER FUNCTION survey.read_outcome_recovery_sources(uuid,uuid) OWNER TO fops_survey_provenance_mutator_owner;
REVOKE ALL ON FUNCTION survey.read_outcome_recovery_sources(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION survey.read_outcome_recovery_sources(uuid,uuid) TO fops_app;
REVOKE CREATE ON SCHEMA survey FROM fops_survey_provenance_mutator_owner;
--> statement-breakpoint
-- Rollback after tracking starts must preserve history/identities. Prefer a forward fix;
-- stopping workers and endpoints is safe, dropping projections destroys recorded evidence.
