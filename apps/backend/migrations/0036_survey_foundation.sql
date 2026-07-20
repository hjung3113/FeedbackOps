-- Issue #184 / ADR-0033: Survey foundation only. Commands arrive in #185.

CREATE SCHEMA IF NOT EXISTS "survey";
--> statement-breakpoint
GRANT USAGE ON SCHEMA "survey" TO fops_app, fops_migrate;
--> statement-breakpoint
GRANT CREATE ON SCHEMA "survey" TO fops_migrate;
--> statement-breakpoint

ALTER TABLE "core"."display_counters"
  DROP CONSTRAINT IF EXISTS "display_counters_entity_type_chk";
--> statement-breakpoint
ALTER TABLE "core"."display_counters"
  ADD CONSTRAINT "display_counters_entity_type_chk"
  CHECK ("entity_type" IN ('task','finding','cluster','task_request','survey'));
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "core"."next_display_id"(p_workspace_id uuid, p_entity_type text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core AS $$
DECLARE v_seq bigint; v_prefix text;
BEGIN
  v_prefix := CASE p_entity_type
    WHEN 'task' THEN 'TASK-' WHEN 'finding' THEN 'FIN-'
    WHEN 'cluster' THEN 'CLU-' WHEN 'task_request' THEN 'REQ-'
    WHEN 'survey' THEN 'SRV-' ELSE NULL END;
  IF v_prefix IS NULL THEN RAISE EXCEPTION 'unknown entity_type: %', p_entity_type; END IF;
  INSERT INTO core.display_counters (workspace_id, entity_type)
  VALUES (p_workspace_id, p_entity_type) ON CONFLICT (workspace_id, entity_type) DO NOTHING;
  UPDATE core.display_counters SET next_value = next_value + 1
   WHERE workspace_id = p_workspace_id AND entity_type = p_entity_type
   RETURNING next_value - 1 INTO v_seq;
  RETURN v_prefix || v_seq::text;
END; $$;
--> statement-breakpoint
ALTER FUNCTION "core"."next_display_id"(uuid, text) OWNER TO fops_migrate;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "core"."next_display_id"(uuid, text) TO fops_app;
--> statement-breakpoint

ALTER TABLE "core"."managed_systems"
  ADD COLUMN IF NOT EXISTS "default_survey_operator_actor_id" uuid REFERENCES "core"."actors"("id");
--> statement-breakpoint

CREATE TABLE "survey"."surveys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "core"."workspaces"("id"),
  "display_id" text NOT NULL,
  "type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "title" text NOT NULL,
  "description" text,
  "primary_managed_system_id" uuid NOT NULL REFERENCES "core"."managed_systems"("id"),
  "analytics_area_id" uuid REFERENCES "core"."analytics_areas"("id"),
  "operator_actor_id" uuid NOT NULL REFERENCES "core"."actors"("id"),
  "responses_identity_protected" boolean NOT NULL DEFAULT false,
  "created_by" uuid NOT NULL REFERENCES "core"."actors"("id"),
  "opened_at" timestamptz,
  "closed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "surveys_type_check" CHECK ("type" IN ('discovery','validation','outcome')),
  CONSTRAINT "surveys_status_check" CHECK ("status" IN ('draft','open','closed')),
  CONSTRAINT "surveys_lifecycle_check" CHECK (
    ("status" = 'draft' AND "opened_at" IS NULL AND "closed_at" IS NULL) OR
    ("status" = 'open' AND "opened_at" IS NOT NULL AND "closed_at" IS NULL) OR
    ("status" = 'closed' AND "opened_at" IS NOT NULL AND "closed_at" IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX "surveys_workspace_display_id_uq" ON "survey"."surveys" ("workspace_id", "display_id");
--> statement-breakpoint
CREATE INDEX "surveys_workspace_managed_system_status_created_at_idx" ON "survey"."surveys" ("workspace_id", "primary_managed_system_id", "status", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX "surveys_workspace_operator_status_idx" ON "survey"."surveys" ("workspace_id", "operator_actor_id", "status");
--> statement-breakpoint

CREATE TABLE "survey"."survey_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "core"."workspaces"("id"),
  "survey_id" uuid NOT NULL REFERENCES "survey"."surveys"("id"),
  "kind" text NOT NULL,
  "prompt" text NOT NULL,
  "is_required" boolean NOT NULL DEFAULT false,
  "options" jsonb,
  "rating_min" integer,
  "rating_max" integer,
  "rating_low_label" text,
  "rating_high_label" text,
  "sort_order" integer NOT NULL,
  "branch_depth" smallint NOT NULL DEFAULT 0,
  "branch_parent_question_id" uuid,
  "branch_parent_depth" smallint,
  "branch_trigger_option_key" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "survey_questions_survey_id_id_uq" UNIQUE ("survey_id", "id"),
  CONSTRAINT "survey_questions_survey_id_id_branch_depth_uq" UNIQUE ("survey_id", "id", "branch_depth"),
  CONSTRAINT "survey_questions_kind_check" CHECK ("kind" IN ('single_choice','multiple_choice','rating','text')),
  CONSTRAINT "survey_questions_sort_order_check" CHECK ("sort_order" >= 0),
  CONSTRAINT "survey_questions_branch_depth_check" CHECK ("branch_depth" IN (0,1)),
  CONSTRAINT "survey_questions_branch_structure_check" CHECK (
    ("branch_depth" = 0 AND "branch_parent_question_id" IS NULL AND "branch_parent_depth" IS NULL AND "branch_trigger_option_key" IS NULL) OR
    ("branch_depth" = 1 AND "branch_parent_question_id" IS NOT NULL AND "branch_parent_depth" = 0 AND "branch_trigger_option_key" IS NOT NULL)
  ),
  CONSTRAINT "survey_questions_branch_parent_fk"
    FOREIGN KEY ("survey_id", "branch_parent_question_id", "branch_parent_depth")
    REFERENCES "survey"."survey_questions" ("survey_id", "id", "branch_depth") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX "survey_questions_survey_sort_order_idx" ON "survey"."survey_questions" ("survey_id", "sort_order", "id");
--> statement-breakpoint

CREATE TABLE "survey"."survey_responses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "core"."workspaces"("id"),
  "survey_id" uuid NOT NULL REFERENCES "survey"."surveys"("id"),
  "respondent_actor_id" uuid NOT NULL REFERENCES "core"."actors"("id"),
  "identity_protected" boolean NOT NULL,
  "submitted_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "survey_responses_survey_id_id_uq" UNIQUE ("survey_id", "id")
);
--> statement-breakpoint

CREATE TABLE "survey"."survey_response_answers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "core"."workspaces"("id"),
  "survey_id" uuid NOT NULL,
  "response_id" uuid NOT NULL,
  "question_id" uuid NOT NULL,
  "answer_kind" text NOT NULL,
  "answer_value" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "survey_response_answers_response_id_question_id_uq" UNIQUE ("response_id", "question_id"),
  CONSTRAINT "survey_response_answers_answer_kind_check" CHECK ("answer_kind" IN ('single_choice','multiple_choice','rating','text')),
  CONSTRAINT "survey_response_answers_response_survey_fk"
    FOREIGN KEY ("survey_id", "response_id") REFERENCES "survey"."survey_responses" ("survey_id", "id"),
  CONSTRAINT "survey_response_answers_question_survey_fk"
    FOREIGN KEY ("survey_id", "question_id") REFERENCES "survey"."survey_questions" ("survey_id", "id")
);
--> statement-breakpoint

GRANT ALL ON "survey"."surveys" TO fops_migrate;
GRANT SELECT, INSERT, UPDATE ON "survey"."surveys" TO fops_app;
--> statement-breakpoint
GRANT ALL ON "survey"."survey_questions" TO fops_migrate;
GRANT SELECT, INSERT, UPDATE, DELETE ON "survey"."survey_questions" TO fops_app;
--> statement-breakpoint
GRANT ALL ON "survey"."survey_responses" TO fops_migrate;
GRANT ALL ON "survey"."survey_response_answers" TO fops_migrate;
