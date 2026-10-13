-- ADR-0064 #740: coordinated rollout with 0059; operator provisioning is required.
DO $$
DECLARE owner_name text;
BEGIN
  FOREACH owner_name IN ARRAY ARRAY['fops_entity_links_view_owner',
    'fops_entity_links_survey_mutator_owner', 'fops_core_audit_reader_owner',
    'fops_survey_derived_finding_reader_owner'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = owner_name
      AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreaterole
      AND NOT rolcreatedb AND NOT rolbypassrls)
      OR NOT pg_catalog.pg_has_role(current_user, owner_name, 'MEMBER')
      OR pg_catalog.pg_has_role('fops_app', owner_name, 'MEMBER')
      OR pg_catalog.pg_has_role(owner_name, 'fops_migrate', 'MEMBER') THEN
      RAISE EXCEPTION '0062 requires least-privileged NOLOGIN/NOINHERIT owner % and one-way migrate membership', owner_name;
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
LOCK TABLE core.entity_links, core.audit_log IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
CREATE VIEW "core"."entity_links_app" WITH (check_option = cascaded, security_barrier = true) AS (select "id", "workspace_id", "source_type", "source_id", "target_type", "target_id", "relation_type", "visibility", "status", "managed_system_id", "created_by", "created_at", "updated_at", "detached_by", "detach_reason", "detached_at" from "core"."entity_links" where "core"."entity_links"."source_type" <> 'survey_response'
    AND "core"."entity_links"."target_type" <> 'survey_response');
GRANT USAGE ON SCHEMA core TO fops_entity_links_view_owner,
  fops_entity_links_survey_mutator_owner, fops_core_audit_reader_owner,
  fops_survey_derived_finding_reader_owner;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON core.entity_links TO fops_entity_links_view_owner;
--> statement-breakpoint
GRANT CREATE ON SCHEMA core TO fops_entity_links_view_owner;
--> statement-breakpoint
ALTER VIEW core.entity_links_app OWNER TO fops_entity_links_view_owner;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA core FROM fops_entity_links_view_owner;
--> statement-breakpoint
SET ROLE fops_entity_links_view_owner;
--> statement-breakpoint
REVOKE ALL ON core.entity_links_app FROM PUBLIC, fops_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON core.entity_links_app TO fops_app;
--> statement-breakpoint
RESET ROLE;
--> statement-breakpoint
GRANT USAGE ON SCHEMA survey, finding TO fops_entity_links_survey_mutator_owner;
--> statement-breakpoint
GRANT SELECT (id,workspace_id,source_type,source_id,target_type,target_id,relation_type,status)
  ON core.entity_links TO fops_entity_links_survey_mutator_owner;
--> statement-breakpoint
GRANT INSERT (workspace_id,source_type,source_id,target_type,target_id,relation_type,
  visibility,status,managed_system_id,created_by) ON core.entity_links
  TO fops_entity_links_survey_mutator_owner;
--> statement-breakpoint
GRANT SELECT (id,workspace_id,survey_id) ON survey.survey_responses
  TO fops_entity_links_survey_mutator_owner;
--> statement-breakpoint
GRANT SELECT (id,workspace_id,primary_managed_system_id) ON survey.surveys
  TO fops_entity_links_survey_mutator_owner;
--> statement-breakpoint
GRANT SELECT (workspace_id,finding_id,response_id) ON survey.finding_response_bindings
  TO fops_entity_links_survey_mutator_owner;
--> statement-breakpoint
GRANT SELECT (id,workspace_id) ON finding.findings TO fops_entity_links_survey_mutator_owner;
--> statement-breakpoint
GRANT SELECT (id,workspace_id) ON core.actors TO fops_entity_links_survey_mutator_owner;
--> statement-breakpoint
CREATE FUNCTION core.create_survey_finding_link(
  p_workspace uuid, p_response uuid, p_finding uuid, p_relation text,
  p_source_system uuid, p_actor uuid
) RETURNS TABLE (id uuid, inserted boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE link_id uuid;
BEGIN
  IF p_relation NOT IN ('generated_finding','evidence_of') OR p_relation IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM survey.finding_response_bindings b
      JOIN survey.survey_responses r ON r.workspace_id = b.workspace_id AND r.id = b.response_id
      JOIN survey.surveys s ON s.workspace_id = r.workspace_id AND s.id = r.survey_id
      JOIN finding.findings f ON f.workspace_id = b.workspace_id AND f.id = b.finding_id
      JOIN core.actors actor ON actor.id = p_actor AND actor.workspace_id = b.workspace_id
      WHERE b.workspace_id = p_workspace AND b.finding_id = p_finding AND b.response_id = p_response
        AND s.primary_managed_system_id = p_source_system
    ) THEN RAISE EXCEPTION 'invalid Survey Finding link' USING ERRCODE = '23514'; END IF;
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
GRANT SELECT (workspace_id,source_type,source_id,target_type,target_id,relation_type,status)
  ON core.entity_links TO fops_survey_derived_finding_reader_owner;
--> statement-breakpoint
GRANT SELECT (id,workspace_id,primary_managed_system_id) ON finding.findings
  TO fops_survey_derived_finding_reader_owner;
--> statement-breakpoint
GRANT USAGE ON SCHEMA survey, finding TO fops_survey_derived_finding_reader_owner;
--> statement-breakpoint
GRANT SELECT (id,workspace_id,survey_id) ON survey.survey_responses
  TO fops_survey_derived_finding_reader_owner;
--> statement-breakpoint
GRANT SELECT (workspace_id,survey_id,response_id,revoked_at)
  ON survey.survey_response_excerpt_approvals TO fops_survey_derived_finding_reader_owner;
--> statement-breakpoint
CREATE FUNCTION survey.read_derived_findings(
  p_workspace uuid, p_survey uuid, p_include_unapproved boolean
)
RETURNS TABLE (finding_id uuid, primary_managed_system_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT DISTINCT f.id, f.primary_managed_system_id
  FROM survey.survey_responses r
  JOIN core.entity_links l ON l.workspace_id = r.workspace_id AND l.source_id = r.id
    AND l.source_type = 'survey_response' AND l.target_type = 'finding'
    AND l.relation_type = 'generated_finding' AND l.status = 'active'
  JOIN finding.findings f ON f.workspace_id = l.workspace_id AND f.id = l.target_id
  WHERE r.workspace_id = p_workspace AND r.survey_id = p_survey
    AND (p_include_unapproved OR EXISTS (
      SELECT 1 FROM survey.survey_response_excerpt_approvals a
      WHERE a.workspace_id = r.workspace_id AND a.survey_id = r.survey_id
        AND a.response_id = r.id AND a.revoked_at IS NULL
    ))
  ORDER BY f.id
$$;
--> statement-breakpoint
GRANT SELECT (id,workspace_id,event_type,subject_type,subject_id,detail,created_at)
  ON core.audit_log TO fops_core_audit_reader_owner;
--> statement-breakpoint
CREATE FUNCTION core.latest_permission_request_question(p_workspace uuid, p_request uuid)
RETURNS TABLE (note text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT a.detail->>'note', a.created_at FROM core.audit_log a
  WHERE a.workspace_id = p_workspace AND a.subject_type = 'permission_request'
    AND a.subject_id = p_request AND a.event_type = 'permission_needs_more_info'
  ORDER BY a.created_at DESC, a.id DESC LIMIT 1
$$;
--> statement-breakpoint
CREATE FUNCTION core.responsibility_configuration_changes(p_workspace uuid)
RETURNS TABLE (managed_system_id uuid, responsibility text, changed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT a.subject_id, kind,
    COALESCE((a.detail->>'configuration_changed_at')::timestamptz, a.created_at)
  FROM core.audit_log a CROSS JOIN (VALUES ('owner'::text),('reviewer'::text)) kinds(kind)
  WHERE a.workspace_id = p_workspace AND a.subject_type = 'managed_system'
    AND a.event_type = 'managed_system_updated'
    AND (a.detail->'changes' ? ('default_' || kind || '_actor_id')
      OR a.detail->'changes' ? ('default_' || kind || '_team_id'))
$$;
--> statement-breakpoint
GRANT CREATE ON SCHEMA core TO fops_entity_links_survey_mutator_owner, fops_core_audit_reader_owner;
--> statement-breakpoint
GRANT CREATE ON SCHEMA survey TO fops_survey_derived_finding_reader_owner;
--> statement-breakpoint
ALTER FUNCTION core.create_survey_finding_link(uuid,uuid,uuid,text,uuid,uuid)
  OWNER TO fops_entity_links_survey_mutator_owner;
--> statement-breakpoint
ALTER FUNCTION survey.read_derived_findings(uuid,uuid,boolean) OWNER TO fops_survey_derived_finding_reader_owner;
--> statement-breakpoint
ALTER FUNCTION core.latest_permission_request_question(uuid,uuid) OWNER TO fops_core_audit_reader_owner;
--> statement-breakpoint
ALTER FUNCTION core.responsibility_configuration_changes(uuid) OWNER TO fops_core_audit_reader_owner;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA core FROM fops_entity_links_survey_mutator_owner, fops_core_audit_reader_owner;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA survey FROM fops_survey_derived_finding_reader_owner;
--> statement-breakpoint
SET ROLE fops_entity_links_survey_mutator_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.create_survey_finding_link(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC, fops_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.create_survey_finding_link(uuid,uuid,uuid,text,uuid,uuid) TO fops_app;
--> statement-breakpoint
RESET ROLE;
--> statement-breakpoint
SET ROLE fops_survey_derived_finding_reader_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION survey.read_derived_findings(uuid,uuid,boolean) FROM PUBLIC, fops_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION survey.read_derived_findings(uuid,uuid,boolean) TO fops_app;
--> statement-breakpoint
RESET ROLE;
--> statement-breakpoint
SET ROLE fops_core_audit_reader_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION core.latest_permission_request_question(uuid,uuid),
  core.responsibility_configuration_changes(uuid) FROM PUBLIC, fops_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION core.latest_permission_request_question(uuid,uuid),
  core.responsibility_configuration_changes(uuid) TO fops_app;
--> statement-breakpoint
RESET ROLE;
--> statement-breakpoint
-- Clear both table and surviving column ACLs, including PUBLIC. Fail closed
-- for inherited grants instead of modifying externally administered memberships.
REVOKE ALL ON core.entity_links FROM fops_app, PUBLIC;
--> statement-breakpoint
REVOKE SELECT ON core.audit_log FROM fops_app, PUBLIC;
--> statement-breakpoint
DO $$
DECLARE column_row record; privilege text;
BEGIN
  FOR column_row IN SELECT attname FROM pg_catalog.pg_attribute
    WHERE attrelid = 'core.entity_links'::regclass AND attnum > 0 AND NOT attisdropped LOOP
    FOREACH privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE','REFERENCES'] LOOP
      EXECUTE pg_catalog.format('REVOKE %s (%I) ON core.entity_links FROM fops_app, PUBLIC', privilege, column_row.attname);
    END LOOP;
  END LOOP;
  FOR column_row IN SELECT attname FROM pg_catalog.pg_attribute
    WHERE attrelid = 'core.audit_log'::regclass AND attnum > 0 AND NOT attisdropped LOOP
    EXECUTE pg_catalog.format('REVOKE SELECT (%I) ON core.audit_log FROM fops_app, PUBLIC', column_row.attname);
  END LOOP;
  IF pg_catalog.has_any_column_privilege('fops_app','core.entity_links','SELECT,INSERT,UPDATE')
    OR pg_catalog.has_table_privilege('fops_app','core.entity_links','DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR pg_catalog.has_any_column_privilege('fops_app','core.audit_log','SELECT,UPDATE')
    OR pg_catalog.has_table_privilege('fops_app','core.audit_log','UPDATE,DELETE,TRUNCATE') THEN
    RAISE EXCEPTION '0062 refuses inherited raw link/audit access; operator must remove unsafe memberships/grants';
  END IF;
END $$;
