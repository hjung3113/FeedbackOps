-- #1109 / ADR-0064: conductor-authorized attachment extension.
-- Drizzle custom generation supplies journal/snapshot; existing roles only.
DO $$
DECLARE owner_name text;
BEGIN
  FOREACH owner_name IN ARRAY ARRAY['fops_survey_provenance_mutator_owner',
                                    'fops_entity_links_survey_mutator_owner'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=owner_name
      AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreaterole
      AND NOT rolcreatedb AND NOT rolbypassrls)
      OR NOT pg_catalog.pg_has_role(current_user,owner_name,'MEMBER')
      OR pg_catalog.pg_has_role('fops_app',owner_name,'MEMBER')
      OR pg_catalog.pg_has_role(owner_name,'fops_migrate','MEMBER') THEN
      RAISE EXCEPTION '0066 requires existing isolated mutator owner %',owner_name;
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
-- The link owner verifies a Finding-owned highlight plus its private witness.
GRANT SELECT (workspace_id,highlight_id,response_id) ON survey.highlight_response_bindings
  TO fops_entity_links_survey_mutator_owner;
--> statement-breakpoint
GRANT SELECT (id,workspace_id,finding_id,source_type) ON finding.evidence_highlights
  TO fops_entity_links_survey_mutator_owner;
--> statement-breakpoint
-- Deferred provenance checks need only the canonical tuple/status/audience.
GRANT USAGE ON SCHEMA core TO fops_survey_provenance_mutator_owner;
--> statement-breakpoint
GRANT SELECT (workspace_id,source_type,source_id,target_type,target_id,relation_type,status,visibility)
  ON core.entity_links TO fops_survey_provenance_mutator_owner;
--> statement-breakpoint
-- Selection-addressed internal resolution: includes revoked selections so source
-- denial precedes revoked/suppressed errors. Never returns text/answer/Actor fields.
CREATE FUNCTION survey.lock_attachment_response(p_workspace uuid,p_approval uuid)
RETURNS TABLE(response_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE selected_response uuid;
BEGIN
  SELECT a.response_id INTO selected_response FROM survey.survey_response_excerpt_approvals a
    JOIN survey.survey_responses r ON r.workspace_id=a.workspace_id AND r.id=a.response_id
      AND r.survey_id=a.survey_id
    WHERE a.workspace_id=p_workspace AND a.id=p_approval;
  IF selected_response IS NULL THEN RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(selected_response::text,0));
  RETURN QUERY SELECT a.response_id FROM survey.survey_response_excerpt_approvals a
    JOIN survey.survey_responses r ON r.workspace_id=a.workspace_id AND r.id=a.response_id
      AND r.survey_id=a.survey_id
    WHERE a.workspace_id=p_workspace AND a.id=p_approval AND a.response_id=selected_response;
END $$;
--> statement-breakpoint
GRANT CREATE ON SCHEMA survey TO fops_survey_provenance_mutator_owner;
--> statement-breakpoint
ALTER FUNCTION survey.lock_attachment_response(uuid,uuid) OWNER TO fops_survey_provenance_mutator_owner;
--> statement-breakpoint
SET ROLE fops_survey_provenance_mutator_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION survey.lock_attachment_response(uuid,uuid) FROM PUBLIC, fops_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION survey.lock_attachment_response(uuid,uuid) TO fops_app;
--> statement-breakpoint
-- Replacing an owned definer requires its owner (fops_migrate does not inherit owner roles).
CREATE OR REPLACE FUNCTION survey.check_finding_response_binding()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE parent_id uuid; parent_workspace uuid;
BEGIN
  IF TG_TABLE_SCHEMA='survey' AND TG_OP='UPDATE' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'protected Survey history is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN
    parent_workspace := OLD.workspace_id;
    IF TG_TABLE_SCHEMA='finding' THEN parent_id := OLD.id;
    ELSE parent_id := OLD.finding_id; END IF;
  ELSE
    parent_workspace := NEW.workspace_id;
    IF TG_TABLE_SCHEMA='finding' THEN parent_id := NEW.id;
    ELSE parent_id := NEW.finding_id; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM finding.findings f WHERE f.id=parent_id AND f.workspace_id=parent_workspace
    AND (f.source_type='survey_response') IS DISTINCT FROM EXISTS
      (SELECT 1 FROM survey.finding_response_bindings b WHERE b.finding_id=f.id AND b.workspace_id=f.workspace_id))
    OR EXISTS (SELECT 1 FROM survey.finding_response_bindings f
      JOIN finding.evidence_highlights h ON h.finding_id=f.finding_id AND h.workspace_id=f.workspace_id
      JOIN survey.highlight_response_bindings b ON b.highlight_id=h.id AND b.workspace_id=h.workspace_id
      WHERE f.finding_id=parent_id AND f.workspace_id=parent_workspace AND b.response_id<>f.response_id
        AND NOT EXISTS (SELECT 1 FROM core.entity_links l
          WHERE l.workspace_id=h.workspace_id AND l.source_type='survey_response'
            AND l.source_id=b.response_id AND l.target_type='finding' AND l.target_id=h.finding_id
            AND l.relation_type='evidence_of' AND l.status='active' AND l.visibility='internal_only'))
    OR EXISTS (SELECT 1 FROM finding.findings f
      JOIN finding.evidence_highlights h ON h.finding_id=f.id
      WHERE f.id=parent_id AND f.workspace_id=parent_workspace AND h.source_type='survey_response'
        AND (f.workspace_id<>h.workspace_id OR f.primary_managed_system_id<>h.primary_managed_system_id))
  THEN RAISE EXCEPTION 'Survey Finding requires exactly one private binding' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION survey.check_highlight_response_binding()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE parent_id uuid; parent_workspace uuid;
BEGIN
  IF TG_TABLE_SCHEMA='survey' AND TG_OP='UPDATE' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'protected Survey history is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN
    parent_workspace := OLD.workspace_id;
    IF TG_TABLE_SCHEMA='finding' THEN parent_id := OLD.id;
    ELSE parent_id := OLD.highlight_id; END IF;
  ELSE
    parent_workspace := NEW.workspace_id;
    IF TG_TABLE_SCHEMA='finding' THEN parent_id := NEW.id;
    ELSE parent_id := NEW.highlight_id; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM finding.evidence_highlights h WHERE h.id=parent_id AND h.workspace_id=parent_workspace
    AND (h.source_type='survey_response') IS DISTINCT FROM EXISTS
      (SELECT 1 FROM survey.highlight_response_bindings b WHERE b.highlight_id=h.id AND b.workspace_id=h.workspace_id))
    OR EXISTS (SELECT 1 FROM survey.highlight_response_bindings b
      JOIN finding.evidence_highlights h ON h.id=b.highlight_id AND h.workspace_id=b.workspace_id
      LEFT JOIN survey.finding_response_bindings f ON f.finding_id=h.finding_id AND f.workspace_id=h.workspace_id
      WHERE h.id=parent_id AND h.workspace_id=parent_workspace
        AND (f.response_id IS NULL OR b.response_id<>f.response_id)
        AND NOT EXISTS (SELECT 1 FROM core.entity_links l
          WHERE l.workspace_id=h.workspace_id AND l.source_type='survey_response'
            AND l.source_id=b.response_id AND l.target_type='finding' AND l.target_id=h.finding_id
            AND l.relation_type='evidence_of' AND l.status='active' AND l.visibility='internal_only'))
    OR EXISTS (SELECT 1 FROM finding.evidence_highlights h
      LEFT JOIN finding.findings f ON f.id=h.finding_id AND f.workspace_id=h.workspace_id
      WHERE h.id=parent_id AND h.workspace_id=parent_workspace AND h.source_type='survey_response'
        AND (f.id IS NULL OR f.primary_managed_system_id<>h.primary_managed_system_id))
  THEN RAISE EXCEPTION 'Survey highlight requires a consistent private binding' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
RESET ROLE;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA survey FROM fops_survey_provenance_mutator_owner;

--> statement-breakpoint
GRANT CREATE ON SCHEMA core TO fops_entity_links_survey_mutator_owner;
--> statement-breakpoint
SET ROLE fops_entity_links_survey_mutator_owner;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION core.create_survey_finding_link(
  p_workspace uuid, p_response uuid, p_finding uuid, p_relation text,
  p_source_system uuid, p_actor uuid
) RETURNS TABLE (id uuid, inserted boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE link_id uuid;
BEGIN
  IF p_relation NOT IN ('generated_finding','evidence_of') OR p_relation IS NULL
    OR (NOT EXISTS (
      SELECT 1 FROM survey.finding_response_bindings b
      JOIN survey.survey_responses r ON r.workspace_id = b.workspace_id AND r.id = b.response_id
      JOIN survey.surveys s ON s.workspace_id = r.workspace_id AND s.id = r.survey_id
      JOIN finding.findings f ON f.workspace_id = b.workspace_id AND f.id = b.finding_id
      JOIN core.actors actor ON actor.id = p_actor AND actor.workspace_id = b.workspace_id
      WHERE b.workspace_id = p_workspace AND b.finding_id = p_finding AND b.response_id = p_response
        AND s.primary_managed_system_id = p_source_system
    ) AND NOT (p_relation='evidence_of' AND EXISTS (
      SELECT 1 FROM survey.highlight_response_bindings b
      JOIN finding.evidence_highlights h ON h.workspace_id=b.workspace_id AND h.id=b.highlight_id
        AND h.source_type='survey_response'
      JOIN finding.findings f ON f.workspace_id=h.workspace_id AND f.id=h.finding_id
      JOIN survey.survey_responses r ON r.workspace_id=b.workspace_id AND r.id=b.response_id
      JOIN survey.surveys s ON s.workspace_id=r.workspace_id AND s.id=r.survey_id
      JOIN core.actors actor ON actor.workspace_id=b.workspace_id AND actor.id=p_actor
      WHERE b.workspace_id=p_workspace AND b.response_id=p_response AND h.finding_id=p_finding
        AND s.primary_managed_system_id=p_source_system
    ))) THEN RAISE EXCEPTION 'invalid Survey Finding link' USING ERRCODE = '23514'; END IF;
  INSERT INTO core.entity_links AS new_link
    (workspace_id,source_type,source_id,target_type,target_id,relation_type,
     visibility,status,managed_system_id,created_by)
  VALUES (p_workspace,'survey_response',p_response,'finding',p_finding,p_relation,
    'internal_only','active',p_source_system,p_actor)
  ON CONFLICT (workspace_id,source_type,source_id,target_type,target_id,relation_type)
    WHERE status = 'active' DO NOTHING RETURNING new_link.id INTO link_id;
  IF link_id IS NOT NULL THEN RETURN QUERY SELECT link_id, true; RETURN; END IF;
  SELECT l.id INTO link_id FROM core.entity_links l
    WHERE l.workspace_id = p_workspace AND l.source_type = 'survey_response'
      AND l.source_id = p_response AND l.target_type = 'finding' AND l.target_id = p_finding
      AND l.relation_type = p_relation AND l.status = 'active';
  IF link_id IS NULL THEN RAISE EXCEPTION 'Survey link conflict lost active row'; END IF;
  RETURN QUERY SELECT link_id, false;
END $$;
--> statement-breakpoint
-- CREATE OR REPLACE retains ownership/ACLs; explicitly reaffirm the changed
-- Entity Links callable surface in the same migration transaction.
REVOKE ALL ON FUNCTION core.create_survey_finding_link(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.create_survey_finding_link(uuid,uuid,uuid,text,uuid,uuid) TO fops_app;
--> statement-breakpoint
RESET ROLE;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA core FROM fops_entity_links_survey_mutator_owner;
