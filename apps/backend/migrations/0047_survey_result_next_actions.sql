GRANT SELECT ("response_id")
  ON "survey"."survey_response_excerpt_approvals" TO fops_survey_evidence_reader_owner;
--> statement-breakpoint

CREATE FUNCTION "survey"."read_approved_result_excerpts_personal"(p_workspace_id uuid, p_survey_id uuid)
RETURNS TABLE(approved_excerpt_id uuid, question_id uuid, redacted_excerpt text, response_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT a.id, a.question_id, a.redacted_excerpt, a.response_id
    FROM survey.survey_response_excerpt_approvals AS a
    JOIN survey.surveys AS s
      ON s.id = a.survey_id
     AND s.workspace_id = a.workspace_id
   WHERE a.workspace_id = p_workspace_id
     AND a.survey_id = p_survey_id
     AND a.revoked_at IS NULL
$$;
--> statement-breakpoint

GRANT CREATE ON SCHEMA "survey" TO fops_survey_evidence_reader_owner;
--> statement-breakpoint
ALTER FUNCTION "survey"."read_approved_result_excerpts_personal"(uuid, uuid) OWNER TO fops_survey_evidence_reader_owner;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA "survey" FROM fops_survey_evidence_reader_owner;
--> statement-breakpoint
SET ROLE fops_survey_evidence_reader_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "survey"."read_approved_result_excerpts_personal"(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "survey"."read_approved_result_excerpts_personal"(uuid, uuid) TO fops_app;
--> statement-breakpoint
RESET ROLE;
