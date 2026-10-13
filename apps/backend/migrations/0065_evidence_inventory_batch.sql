-- ADR-0065: bounded cross-Finding hydration under ADR-0064's response lock order.
-- Findings authorizes every supplied local highlight's parent in the caller transaction.
-- Existing reader owner/column privileges suffice; no private table app grant is added.
CREATE FUNCTION survey.read_inventory_highlight_evidence(p_workspace_id uuid,p_highlight_ids uuid[])
RETURNS TABLE(highlight_id uuid,primary_managed_system_id uuid,survey_type text,
  survey_display_id text,identity_protected boolean,question_label text,approved_excerpt_snapshot text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE response_uuid uuid;
BEGIN
  IF pg_catalog.cardinality(p_highlight_ids)>100 THEN
    RAISE EXCEPTION 'Evidence hydration batch exceeds 100' USING ERRCODE='22023';
  END IF;
  FOR response_uuid IN SELECT DISTINCT b.response_id FROM survey.highlight_response_bindings b
    JOIN finding.evidence_highlights h ON h.workspace_id=b.workspace_id AND h.id=b.highlight_id
    WHERE b.workspace_id=p_workspace_id AND h.id=ANY(p_highlight_ids)
      AND h.source_type='survey_response' ORDER BY b.response_id LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(response_uuid::text,0));
  END LOOP;
  -- Fresh READ COMMITTED snapshot after waiting for any competing revoke.
  RETURN QUERY SELECT h.id,s.primary_managed_system_id,s.type,s.display_id,
    r.identity_protected,q.prompt,b.approved_excerpt_snapshot
    FROM survey.highlight_response_bindings b
    JOIN finding.evidence_highlights h ON h.workspace_id=b.workspace_id AND h.id=b.highlight_id
    JOIN survey.survey_responses r ON r.workspace_id=b.workspace_id AND r.id=b.response_id
    JOIN survey.surveys s ON s.workspace_id=r.workspace_id AND s.id=r.survey_id
    JOIN survey.survey_response_excerpt_approvals a ON a.workspace_id=b.workspace_id
      AND a.response_id=b.response_id AND a.id=b.approved_excerpt_id AND a.survey_id=r.survey_id
    JOIN survey.survey_questions q ON q.workspace_id=a.workspace_id
      AND q.survey_id=a.survey_id AND q.id=a.question_id AND q.kind='text'
    WHERE b.workspace_id=p_workspace_id AND h.id=ANY(p_highlight_ids)
      AND h.source_type='survey_response' AND s.status<>'draft' AND a.revoked_at IS NULL
    ORDER BY h.id;
END $$;
--> statement-breakpoint
GRANT CREATE ON SCHEMA survey TO fops_survey_evidence_reader_owner;
--> statement-breakpoint
ALTER FUNCTION survey.read_inventory_highlight_evidence(uuid,uuid[]) OWNER TO fops_survey_evidence_reader_owner;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA survey FROM fops_survey_evidence_reader_owner;
--> statement-breakpoint
SET ROLE fops_survey_evidence_reader_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION survey.read_inventory_highlight_evidence(uuid,uuid[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION survey.read_inventory_highlight_evidence(uuid,uuid[]) TO fops_app;
--> statement-breakpoint
RESET ROLE;
