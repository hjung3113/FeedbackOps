GRANT SELECT ("response_id")
  ON "survey"."survey_response_excerpt_approvals" TO fops_survey_evidence_reader_owner;
--> statement-breakpoint
GRANT SELECT ("workspace_id", "source_type", "source_id", "target_type", "target_id", "relation_type", "status")
  ON "core"."entity_links" TO fops_survey_evidence_reader_owner;
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

CREATE FUNCTION "survey"."read_survey_generated_finding_ids"(p_workspace_id uuid, p_survey_id uuid)
RETURNS TABLE(finding_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT DISTINCT l.target_id
    FROM core.entity_links AS l
    JOIN survey.survey_responses AS r
      ON r.id = l.source_id
     AND r.workspace_id = l.workspace_id
   WHERE l.workspace_id = p_workspace_id
     AND r.survey_id = p_survey_id
     AND l.source_type = 'survey_response'
     AND l.target_type = 'finding'
     AND l.relation_type = 'generated_finding'
     AND l.status = 'active'
$$;
--> statement-breakpoint

GRANT CREATE ON SCHEMA "survey" TO fops_survey_evidence_reader_owner;
--> statement-breakpoint
ALTER FUNCTION "survey"."read_approved_result_excerpts_personal"(uuid, uuid) OWNER TO fops_survey_evidence_reader_owner;
--> statement-breakpoint
ALTER FUNCTION "survey"."read_survey_generated_finding_ids"(uuid, uuid) OWNER TO fops_survey_evidence_reader_owner;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA "survey" FROM fops_survey_evidence_reader_owner;
--> statement-breakpoint
SET ROLE fops_survey_evidence_reader_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "survey"."read_approved_result_excerpts_personal"(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "survey"."read_survey_generated_finding_ids"(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "survey"."read_approved_result_excerpts_personal"(uuid, uuid) TO fops_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "survey"."read_survey_generated_finding_ids"(uuid, uuid) TO fops_app;
--> statement-breakpoint
RESET ROLE;
