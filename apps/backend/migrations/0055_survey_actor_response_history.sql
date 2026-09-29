-- Issue #548: return only a session Actor's own response-history metadata.
-- The app role still cannot select survey responses directly; this narrow
-- projection returns no response id, respondent actor id, answers, or other actors' rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'fops_survey_evidence_reader_owner'
  ) THEN
    RAISE EXCEPTION USING MESSAGE =
      'migration 0055 requires role fops_survey_evidence_reader_owner; '
      'run the privileged bootstrap prerequisite from scripts/db/init.sql first';
  END IF;
  IF NOT pg_catalog.pg_has_role(current_user, 'fops_survey_evidence_reader_owner', 'MEMBER') THEN
    RAISE EXCEPTION USING MESSAGE = pg_catalog.format(
      'migration 0055 requires %s to be a member of fops_survey_evidence_reader_owner; '
      'run the privileged bootstrap prerequisite from scripts/db/init.sql first',
      current_user
    );
  END IF;
END
$$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA "survey" TO fops_survey_evidence_reader_owner;
--> statement-breakpoint
GRANT SELECT ("title") ON "survey"."surveys" TO fops_survey_evidence_reader_owner;
--> statement-breakpoint
GRANT SELECT ("respondent_actor_id", "submitted_at")
  ON "survey"."survey_responses" TO fops_survey_evidence_reader_owner;
--> statement-breakpoint

CREATE FUNCTION "survey"."read_my_survey_response_history"(
  p_workspace_id uuid,
  p_respondent_actor_id uuid,
  p_limit integer,
  p_cursor_submitted_at timestamptz,
  p_cursor_survey_id uuid
)
RETURNS TABLE(
  survey_id uuid,
  survey_title text,
  submitted_at timestamptz,
  identity_protected boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT r.survey_id, s.title, r.submitted_at, r.identity_protected
    FROM survey.survey_responses AS r
    JOIN survey.surveys AS s
      ON s.id = r.survey_id
     AND s.workspace_id = r.workspace_id
   WHERE r.workspace_id = p_workspace_id
     AND r.respondent_actor_id = p_respondent_actor_id
     AND (
       (p_cursor_submitted_at IS NULL AND p_cursor_survey_id IS NULL)
       OR (
         p_cursor_submitted_at IS NOT NULL
         AND p_cursor_survey_id IS NOT NULL
         AND (r.submitted_at, r.survey_id) < (p_cursor_submitted_at, p_cursor_survey_id)
       )
     )
   ORDER BY r.submitted_at DESC, r.survey_id DESC
   LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 101))
$$;
--> statement-breakpoint

GRANT CREATE ON SCHEMA "survey" TO fops_survey_evidence_reader_owner;
--> statement-breakpoint
ALTER FUNCTION "survey"."read_my_survey_response_history"(uuid, uuid, integer, timestamptz, uuid)
  OWNER TO fops_survey_evidence_reader_owner;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA "survey" FROM fops_survey_evidence_reader_owner;
--> statement-breakpoint
SET ROLE fops_survey_evidence_reader_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "survey"."read_my_survey_response_history"(
  uuid, uuid, integer, timestamptz, uuid
) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "survey"."read_my_survey_response_history"(
  uuid, uuid, integer, timestamptz, uuid
) TO fops_app;
--> statement-breakpoint
RESET ROLE;
