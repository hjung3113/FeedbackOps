-- Issue #718: respondent discovery — open, not-yet-answered Surveys for the session Actor.
-- The app role cannot select survey.survey_responses; this narrow projection filters
-- answered Surveys inside the definer and returns no respondent identity, response id,
-- or answer data — only Survey-level fields.
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
GRANT SELECT ("opened_at") ON "survey"."surveys" TO fops_survey_evidence_reader_owner;
--> statement-breakpoint

CREATE FUNCTION "survey"."read_my_answerable_surveys"(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_limit integer,
  p_cursor_opened_at timestamptz,
  p_cursor_survey_id uuid
)
RETURNS TABLE(
  survey_id uuid,
  display_id text,
  title text,
  type text,
  question_count bigint,
  opened_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT s.id,
         s.display_id,
         s.title,
         s.type,
         (
           SELECT count(q.id)
             FROM survey.survey_questions AS q
            WHERE q.workspace_id = s.workspace_id
              AND q.survey_id = s.id
         ),
         s.opened_at
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
     AND (
       (p_cursor_opened_at IS NULL AND p_cursor_survey_id IS NULL)
       OR (
         p_cursor_opened_at IS NOT NULL
         AND p_cursor_survey_id IS NOT NULL
         AND (s.opened_at, s.id) < (p_cursor_opened_at, p_cursor_survey_id)
       )
     )
   ORDER BY s.opened_at DESC, s.id DESC
   LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 101))
$$;
--> statement-breakpoint

GRANT CREATE ON SCHEMA "survey" TO fops_survey_evidence_reader_owner;
--> statement-breakpoint
ALTER FUNCTION "survey"."read_my_answerable_surveys"(uuid, uuid, integer, timestamptz, uuid)
  OWNER TO fops_survey_evidence_reader_owner;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA "survey" FROM fops_survey_evidence_reader_owner;
--> statement-breakpoint
SET ROLE fops_survey_evidence_reader_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "survey"."read_my_answerable_surveys"(
  uuid, uuid, integer, timestamptz, uuid
) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "survey"."read_my_answerable_surveys"(
  uuid, uuid, integer, timestamptz, uuid
) TO fops_app;
--> statement-breakpoint
RESET ROLE;
