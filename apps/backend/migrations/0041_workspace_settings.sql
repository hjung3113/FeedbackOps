-- Slice 9 #195: workspace-level settings and policy singleton.
CREATE TABLE "core"."workspace_settings" (
  "workspace_id" uuid PRIMARY KEY REFERENCES "core"."workspaces"("id"),
  "permission_self_approval" text NOT NULL DEFAULT 'allowed',
  "survey_anonymity_threshold" integer NOT NULL DEFAULT 5,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_settings_permission_self_approval_check"
    CHECK ("permission_self_approval" IN ('allowed','forbidden')),
  CONSTRAINT "workspace_settings_survey_anonymity_threshold_check"
    CHECK ("survey_anonymity_threshold" BETWEEN 5 AND 50)
);
--> statement-breakpoint
GRANT ALL ON "core"."workspace_settings" TO fops_migrate;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "core"."workspace_settings" TO fops_app;
