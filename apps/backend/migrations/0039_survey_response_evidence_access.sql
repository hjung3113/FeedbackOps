-- Issue #187 C2: survey-response evidence can cross the database boundary only
-- through these narrow SECURITY DEFINER readers. Existing databases must have
-- the NOLOGIN owner and one-way fops_migrate membership bootstrapped by a
-- privileged operator; scripts/db/init.sql provides the empty-database path.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'fops_survey_evidence_reader_owner') THEN
    RAISE EXCEPTION
      'migration 0039 requires role fops_survey_evidence_reader_owner; run the privileged bootstrap prerequisite from scripts/db/init.sql first';
  END IF;
  IF NOT pg_catalog.pg_has_role(current_user, 'fops_survey_evidence_reader_owner', 'MEMBER') THEN
    RAISE EXCEPTION
      'migration 0039 requires % to be a member of fops_survey_evidence_reader_owner; run the privileged bootstrap prerequisite from scripts/db/init.sql first', current_user;
  END IF;
END
$$;

-- PostgreSQL requires temporary CREATE on the containing schema to transfer
-- function ownership. It is revoked immediately after the transfers.
GRANT USAGE, CREATE ON SCHEMA "survey" TO fops_survey_evidence_reader_owner;
--> statement-breakpoint
GRANT SELECT ("id", "workspace_id", "display_id", "type", "status", "primary_managed_system_id", "analytics_area_id")
  ON "survey"."surveys" TO fops_survey_evidence_reader_owner;
--> statement-breakpoint
GRANT SELECT ("id", "workspace_id", "survey_id", "identity_protected")
  ON "survey"."survey_responses" TO fops_survey_evidence_reader_owner;
--> statement-breakpoint
GRANT SELECT ("id", "workspace_id", "survey_id", "kind", "prompt")
  ON "survey"."survey_questions" TO fops_survey_evidence_reader_owner;
--> statement-breakpoint
GRANT SELECT ("workspace_id", "survey_id", "response_id", "question_id", "answer_kind", "answer_value")
  ON "survey"."survey_response_answers" TO fops_survey_evidence_reader_owner;
--> statement-breakpoint

CREATE TABLE "survey"."survey_response_excerpt_approvals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "core"."workspaces"("id"),
  "survey_id" uuid NOT NULL REFERENCES "survey"."surveys"("id"),
  "response_id" uuid NOT NULL,
  "question_id" uuid NOT NULL,
  "redacted_excerpt" text NOT NULL,
  "approved_by" uuid NOT NULL REFERENCES "core"."actors"("id"),
  "approved_at" timestamptz NOT NULL DEFAULT now(),
  "revoked_at" timestamptz,
  CONSTRAINT "survey_response_excerpt_approvals_response_survey_fk"
    FOREIGN KEY ("survey_id", "response_id")
    REFERENCES "survey"."survey_responses" ("survey_id", "id"),
  CONSTRAINT "survey_response_excerpt_approvals_question_survey_fk"
    FOREIGN KEY ("survey_id", "question_id")
    REFERENCES "survey"."survey_questions" ("survey_id", "id")
);
--> statement-breakpoint
CREATE INDEX "survey_response_excerpt_approvals_workspace_survey_active_idx"
  ON "survey"."survey_response_excerpt_approvals" ("workspace_id", "survey_id", "approved_at" DESC)
  WHERE "revoked_at" IS NULL;
--> statement-breakpoint
GRANT ALL ON "survey"."survey_response_excerpt_approvals" TO fops_migrate;
--> statement-breakpoint
GRANT INSERT, SELECT ON "survey"."survey_response_excerpt_approvals" TO fops_app;
--> statement-breakpoint
GRANT UPDATE ("revoked_at") ON "survey"."survey_response_excerpt_approvals" TO fops_app;
--> statement-breakpoint
GRANT SELECT ("id", "workspace_id", "survey_id", "question_id", "redacted_excerpt", "revoked_at")
  ON "survey"."survey_response_excerpt_approvals" TO fops_survey_evidence_reader_owner;
--> statement-breakpoint

CREATE FUNCTION "survey"."lock_response_evidence_subject"(p_workspace_id uuid, p_response_id uuid)
RETURNS TABLE(
  response_id uuid,
  survey_id uuid,
  survey_display_id text,
  survey_type text,
  survey_status text,
  primary_managed_system_id uuid,
  analytics_area_id uuid,
  identity_protected boolean
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  -- The transaction-scoped advisory key is hashtextextended(response UUID text, 0),
  -- so every call for one response serializes without requiring UPDATE on its row.
  SELECT pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_response_id::text, 0)
  );

  SELECT r.id, s.id, s.display_id, s.type, s.status, s.primary_managed_system_id,
         s.analytics_area_id, r.identity_protected
    FROM survey.survey_responses AS r
    JOIN survey.surveys AS s
      ON s.id = r.survey_id
     AND s.workspace_id = r.workspace_id
   WHERE r.workspace_id = p_workspace_id
     AND r.id = p_response_id
$$;
--> statement-breakpoint

CREATE FUNCTION "survey"."read_response_text_candidate"(
  p_workspace_id uuid,
  p_response_id uuid,
  p_question_id uuid
)
RETURNS TABLE(question_id uuid, question_label text, raw_text text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT q.id, q.prompt, a.answer_value #>> '{}'
    FROM survey.survey_responses AS r
    JOIN survey.survey_response_answers AS a
      ON a.response_id = r.id
     AND a.survey_id = r.survey_id
     AND a.workspace_id = r.workspace_id
    JOIN survey.survey_questions AS q
      ON q.id = a.question_id
     AND q.survey_id = a.survey_id
     AND q.workspace_id = a.workspace_id
   WHERE r.workspace_id = p_workspace_id
     AND r.id = p_response_id
     AND q.id = p_question_id
     AND a.answer_kind = 'text'
     AND q.kind = 'text'
$$;
--> statement-breakpoint

CREATE FUNCTION "survey"."read_approved_result_excerpts"(p_workspace_id uuid, p_survey_id uuid)
RETURNS TABLE(approved_excerpt_id uuid, question_id uuid, redacted_excerpt text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT a.id, a.question_id, a.redacted_excerpt
    FROM survey.survey_response_excerpt_approvals AS a
    JOIN survey.surveys AS s
      ON s.id = a.survey_id
     AND s.workspace_id = a.workspace_id
   WHERE a.workspace_id = p_workspace_id
     AND a.survey_id = p_survey_id
     AND a.revoked_at IS NULL
$$;
--> statement-breakpoint

ALTER FUNCTION "survey"."lock_response_evidence_subject"(uuid, uuid) OWNER TO fops_survey_evidence_reader_owner;
--> statement-breakpoint
ALTER FUNCTION "survey"."read_response_text_candidate"(uuid, uuid, uuid) OWNER TO fops_survey_evidence_reader_owner;
--> statement-breakpoint
ALTER FUNCTION "survey"."read_approved_result_excerpts"(uuid, uuid) OWNER TO fops_survey_evidence_reader_owner;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA "survey" FROM fops_survey_evidence_reader_owner;
--> statement-breakpoint
SET ROLE fops_survey_evidence_reader_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "survey"."lock_response_evidence_subject"(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "survey"."read_response_text_candidate"(uuid, uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "survey"."read_approved_result_excerpts"(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "survey"."lock_response_evidence_subject"(uuid, uuid) TO fops_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "survey"."read_response_text_candidate"(uuid, uuid, uuid) TO fops_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "survey"."read_approved_result_excerpts"(uuid, uuid) TO fops_app;
--> statement-breakpoint
RESET ROLE;
--> statement-breakpoint

ALTER TABLE "finding"."findings"
  DROP CONSTRAINT IF EXISTS "findings_source_type_check";
--> statement-breakpoint
ALTER TABLE "finding"."findings"
  ADD CONSTRAINT "findings_source_type_check"
  CHECK ("source_type" IN ('voc','voc_cluster','survey','survey_response','manual'));
--> statement-breakpoint

ALTER TABLE "core"."entity_links"
  DROP CONSTRAINT IF EXISTS "entity_links_tuple_check";
--> statement-breakpoint
ALTER TABLE "core"."entity_links"
  ADD CONSTRAINT "entity_links_tuple_check"
  CHECK (("source_type", "target_type", "relation_type") IN (
    ('voc','voc','related_to'),
    ('voc','finding','created_finding'),
    ('voc','finding','evidence_of'),
    ('voc_cluster','finding','created_finding'),
    ('voc_cluster','finding','evidence_of'),
    ('finding','task_request','requested_task'),
    ('task_request','task','converted_to'),
    ('finding','task','requested_task'),
    ('voc','task','evidence_of'),
    ('voc','task_request','requested_task'),
    ('voc_cluster','task_request','requested_task'),
    ('survey_response','finding','generated_finding'),
    ('survey_response','finding','evidence_of')
  ));
