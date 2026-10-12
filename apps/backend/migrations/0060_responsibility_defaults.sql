CREATE TABLE "core"."responsibility_default_failures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"managed_system_id" uuid NOT NULL,
	"workflow" text NOT NULL,
	"responsibility" text NOT NULL,
	"rule" text NOT NULL,
	"category" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "responsibility_default_failures_workflow_check" CHECK ("core"."responsibility_default_failures"."workflow" IN ('voc','finding','task_request','task')),
	CONSTRAINT "responsibility_default_failures_responsibility_check" CHECK ("core"."responsibility_default_failures"."responsibility" IN ('owner','reviewer')),
	CONSTRAINT "responsibility_default_failures_rule_check" CHECK ("core"."responsibility_default_failures"."rule" IN ('managed_system_owner','managed_system_reviewer','analytics_area_owner')),
	CONSTRAINT "responsibility_default_failures_category_check" CHECK ("core"."responsibility_default_failures"."category" IN ('missing','invalid_pair','foreign_workspace','archived_team','ineligible_actor'))
);
--> statement-breakpoint
ALTER TABLE "finding"."findings" ADD COLUMN "owner_actor_id" uuid;--> statement-breakpoint
ALTER TABLE "finding"."findings" ADD COLUMN "owner_team_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."managed_systems" ADD COLUMN "default_reviewer_actor_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."managed_systems" ADD COLUMN "default_reviewer_team_id" uuid;--> statement-breakpoint
ALTER TABLE "task_request"."task_requests" ADD COLUMN "assigned_reviewer_actor_id" uuid;--> statement-breakpoint
ALTER TABLE "task_request"."task_requests" ADD COLUMN "assigned_reviewer_team_id" uuid;--> statement-breakpoint
ALTER TABLE "task"."tasks" ADD COLUMN "assignee_team_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."responsibility_default_failures" ADD CONSTRAINT "responsibility_default_failures_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."responsibility_default_failures" ADD CONSTRAINT "responsibility_default_failures_managed_system_id_managed_systems_id_fk" FOREIGN KEY ("managed_system_id") REFERENCES "core"."managed_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "responsibility_default_failures_workspace_system_created_idx" ON "core"."responsibility_default_failures" USING btree ("workspace_id","managed_system_id","created_at");--> statement-breakpoint
ALTER TABLE "finding"."findings" ADD CONSTRAINT "findings_owner_actor_id_actors_id_fk" FOREIGN KEY ("owner_actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding"."findings" ADD CONSTRAINT "findings_owner_team_id_teams_id_fk" FOREIGN KEY ("owner_team_id") REFERENCES "core"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."managed_systems" ADD CONSTRAINT "managed_systems_default_reviewer_actor_id_actors_id_fk" FOREIGN KEY ("default_reviewer_actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."managed_systems" ADD CONSTRAINT "managed_systems_default_reviewer_team_id_teams_id_fk" FOREIGN KEY ("default_reviewer_team_id") REFERENCES "core"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_request"."task_requests" ADD CONSTRAINT "task_requests_assigned_reviewer_actor_id_actors_id_fk" FOREIGN KEY ("assigned_reviewer_actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_request"."task_requests" ADD CONSTRAINT "task_requests_assigned_reviewer_team_id_teams_id_fk" FOREIGN KEY ("assigned_reviewer_team_id") REFERENCES "core"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task"."tasks" ADD CONSTRAINT "tasks_assignee_team_id_teams_id_fk" FOREIGN KEY ("assignee_team_id") REFERENCES "core"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding"."findings" ADD CONSTRAINT "findings_responsibility_xor_check" CHECK ("finding"."findings"."owner_actor_id" IS NULL OR "finding"."findings"."owner_team_id" IS NULL);--> statement-breakpoint
ALTER TABLE "core"."managed_systems" ADD CONSTRAINT "managed_systems_default_reviewer_xor_check" CHECK ("core"."managed_systems"."default_reviewer_actor_id" IS NULL OR "core"."managed_systems"."default_reviewer_team_id" IS NULL);--> statement-breakpoint
ALTER TABLE "task_request"."task_requests" ADD CONSTRAINT "task_requests_responsibility_xor_check" CHECK ("task_request"."task_requests"."assigned_reviewer_actor_id" IS NULL OR "task_request"."task_requests"."assigned_reviewer_team_id" IS NULL);--> statement-breakpoint
ALTER TABLE "task"."tasks" ADD CONSTRAINT "tasks_responsibility_xor_check" CHECK ("task"."tasks"."assignee_actor_id" IS NULL OR "task"."tasks"."assignee_team_id" IS NULL);
--> statement-breakpoint
-- Diagnostic input is append-only for runtime, with no candidate/source identity.
GRANT ALL ON core.responsibility_default_failures TO fops_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON core.responsibility_default_failures TO fops_app;
