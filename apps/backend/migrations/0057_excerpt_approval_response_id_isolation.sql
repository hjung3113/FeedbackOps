-- Issue #569: fops_app must not link identity-protected respondents to approved
-- excerpt text. The 0039 table-wide SELECT let fops_app join core.audit_log
-- submission rows (respondent Actor ↔ response id) to
-- survey_response_excerpt_approvals.response_id. Replace it with a column-level
-- SELECT on every column except response_id, and move every per-response read
-- (highlight projections, active-approval check, revoke binding check) into
-- narrow SECURITY DEFINER readers owned by fops_survey_evidence_reader_owner,
-- following the 0039/0047/0056 pattern. The owner already holds
-- SELECT ("response_id") from 0047; no grant widens and fops_app ends with
-- strictly fewer privileges on this table.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'fops_survey_evidence_reader_owner'
  ) THEN
    RAISE EXCEPTION USING MESSAGE =
      'migration 0057 requires role fops_survey_evidence_reader_owner; '
      'run the privileged bootstrap prerequisite from scripts/db/init.sql first';
  END IF;
  IF NOT pg_catalog.pg_has_role(current_user, 'fops_survey_evidence_reader_owner', 'MEMBER') THEN
    RAISE EXCEPTION USING MESSAGE = pg_catalog.format(
      'migration 0057 requires %s to be a member of fops_survey_evidence_reader_owner; '
      'run the privileged bootstrap prerequisite from scripts/db/init.sql first',
      current_user
    );
  END IF;
END
$$;
--> statement-breakpoint

REVOKE SELECT ON "survey"."survey_response_excerpt_approvals" FROM fops_app;
--> statement-breakpoint
GRANT SELECT ("id", "workspace_id", "survey_id", "question_id", "redacted_excerpt", "approved_by", "approved_at", "revoked_at")
  ON "survey"."survey_response_excerpt_approvals" TO fops_app;
--> statement-breakpoint

-- Revoke binding check: resolves one approval for one response and whether it
-- is still active. The app verifies this before its own revoked_at update, so
-- fops_app never filters on response_id.
CREATE FUNCTION "survey"."read_response_excerpt_approval"(
  p_workspace_id uuid,
  p_response_id uuid,
  p_approved_excerpt_id uuid
)
RETURNS TABLE(question_id uuid, redacted_excerpt text, is_active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT a.question_id, a.redacted_excerpt, a.revoked_at IS NULL
    FROM survey.survey_response_excerpt_approvals AS a
   WHERE a.workspace_id = p_workspace_id
     AND a.response_id = p_response_id
     AND a.id = p_approved_excerpt_id
$$;
--> statement-breakpoint

-- Active approval projection for one response (evidence highlights and the
-- stored-highlight safety check). Returns only active approvals.
CREATE FUNCTION "survey"."read_approved_response_excerpts"(
  p_workspace_id uuid,
  p_response_id uuid,
  p_approved_excerpt_ids uuid[]
)
RETURNS TABLE(approved_excerpt_id uuid, question_id uuid, redacted_excerpt text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT a.id, a.question_id, a.redacted_excerpt
    FROM survey.survey_response_excerpt_approvals AS a
   WHERE a.workspace_id = p_workspace_id
     AND a.response_id = p_response_id
     AND a.id = ANY(p_approved_excerpt_ids)
     AND a.revoked_at IS NULL
$$;
--> statement-breakpoint

GRANT CREATE ON SCHEMA "survey" TO fops_survey_evidence_reader_owner;
--> statement-breakpoint
ALTER FUNCTION "survey"."read_response_excerpt_approval"(uuid, uuid, uuid)
  OWNER TO fops_survey_evidence_reader_owner;
--> statement-breakpoint
ALTER FUNCTION "survey"."read_approved_response_excerpts"(uuid, uuid, uuid[])
  OWNER TO fops_survey_evidence_reader_owner;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA "survey" FROM fops_survey_evidence_reader_owner;
--> statement-breakpoint
SET ROLE fops_survey_evidence_reader_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "survey"."read_response_excerpt_approval"(uuid, uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "survey"."read_approved_response_excerpts"(uuid, uuid, uuid[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "survey"."read_response_excerpt_approval"(uuid, uuid, uuid) TO fops_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "survey"."read_approved_response_excerpts"(uuid, uuid, uuid[]) TO fops_app;
--> statement-breakpoint
RESET ROLE;
