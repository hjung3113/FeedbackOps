-- Issue #718: respondent discovery — open, not-yet-answered Surveys for the session Actor.
-- Split read (no grant widening): the app role cannot select survey.survey_responses, so this
-- definer only excludes Surveys the session Actor already answered and returns their Survey ids.
-- The Survey-level metadata (display_id, title, type, question_count, opened_at) and the
-- opened_at DESC, survey_id DESC ordering with cursor pagination run in the app query over
-- survey.surveys / survey_questions, which fops_app already selects. The owner therefore needs
-- no surveys.opened_at grant.
-- Owner: fops_survey_evidence_reader_owner (existing NOLOGIN owner of survey definer readers; only fops_migrate is a member).
-- No function under this owner may project respondent identity with text (grants pinned by src/db/__tests__/survey-response-evidence.integration.test.ts).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'fops_survey_evidence_reader_owner'
  ) THEN
    RAISE EXCEPTION USING MESSAGE =
      'migration 0056 requires role fops_survey_evidence_reader_owner; '
      'run the privileged bootstrap prerequisite from scripts/db/init.sql first';
  END IF;
  IF NOT pg_catalog.pg_has_role(current_user, 'fops_survey_evidence_reader_owner', 'MEMBER') THEN
    RAISE EXCEPTION USING MESSAGE = pg_catalog.format(
      'migration 0056 requires %s to be a member of fops_survey_evidence_reader_owner; '
      'run the privileged bootstrap prerequisite from scripts/db/init.sql first',
      current_user
    );
  END IF;
END
$$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA "survey" TO fops_survey_evidence_reader_owner;
--> statement-breakpoint

CREATE FUNCTION "survey"."read_my_answerable_surveys"(
  p_workspace_id uuid,
  p_actor_id uuid
)
RETURNS TABLE(survey_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT s.id
    FROM survey.surveys AS s
   WHERE s.workspace_id = p_workspace_id
     AND s.status = 'open'
     AND NOT EXISTS (
       SELECT 1
         FROM survey.survey_responses AS r
        WHERE r.workspace_id = s.workspace_id
          AND r.survey_id = s.id
          AND r.respondent_actor_id = p_actor_id
     )
$$;
--> statement-breakpoint

GRANT CREATE ON SCHEMA "survey" TO fops_survey_evidence_reader_owner;
--> statement-breakpoint
ALTER FUNCTION "survey"."read_my_answerable_surveys"(uuid, uuid)
  OWNER TO fops_survey_evidence_reader_owner;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA "survey" FROM fops_survey_evidence_reader_owner;
--> statement-breakpoint
SET ROLE fops_survey_evidence_reader_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "survey"."read_my_answerable_surveys"(
  uuid, uuid
) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "survey"."read_my_answerable_surveys"(
  uuid, uuid
) TO fops_app;
--> statement-breakpoint
RESET ROLE;
