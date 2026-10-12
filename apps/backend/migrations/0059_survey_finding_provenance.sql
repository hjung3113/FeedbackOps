-- #739 / ADR-0064. Drizzle-generated DDL below is ordered so that legacy
-- data is retained before public copies are cleared. Runs in the migrator transaction.
DO $$
DECLARE owner_name text;
BEGIN
  FOREACH owner_name IN ARRAY ARRAY['fops_survey_evidence_reader_owner',
                                    'fops_survey_provenance_mutator_owner'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=owner_name
                   AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper
                   AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolbypassrls)
       OR NOT pg_catalog.pg_has_role(current_user, owner_name, 'MEMBER') THEN
      RAISE EXCEPTION '0059 requires NOLOGIN/NOINHERIT owner % and one-way migrate membership; provision the privileged prerequisite first', owner_name;
    END IF;
    IF pg_catalog.pg_has_role('fops_app', owner_name, 'MEMBER')
       OR pg_catalog.pg_has_role(owner_name, 'fops_migrate', 'MEMBER') THEN
      RAISE EXCEPTION '0059 rejects app owner membership or reverse migrate membership';
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
LOCK TABLE finding.findings, finding.evidence_highlights,
  survey.survey_responses, survey.surveys, survey.survey_response_excerpt_approvals,
  survey.survey_questions, core.idempotency_keys IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
-- Validate history before any cutover. Never infer response bindings from highlights.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM finding.findings f
    LEFT JOIN survey.survey_responses r ON r.id=f.source_id AND r.workspace_id=f.workspace_id
    LEFT JOIN survey.surveys s ON s.id=r.survey_id AND s.workspace_id=r.workspace_id
    WHERE f.source_type='survey_response' AND (r.id IS NULL OR s.id IS NULL)
  ) OR EXISTS (
    SELECT 1 FROM finding.evidence_highlights h
    LEFT JOIN finding.findings f ON f.id=h.finding_id AND f.workspace_id=h.workspace_id
    LEFT JOIN survey.survey_responses r ON r.id=h.source_id AND r.workspace_id=h.workspace_id
    LEFT JOIN survey.surveys s ON s.id=r.survey_id AND s.workspace_id=r.workspace_id
    LEFT JOIN survey.survey_response_excerpt_approvals a
      ON a.id=h.approved_excerpt_id AND a.workspace_id=h.workspace_id
     AND a.response_id=h.source_id AND a.survey_id=r.survey_id
    LEFT JOIN survey.survey_questions q ON q.id=a.question_id
      AND q.survey_id=a.survey_id AND q.workspace_id=a.workspace_id AND q.kind='text'
    WHERE h.source_type='survey_response' AND
      (f.id IS NULL OR r.id IS NULL OR s.id IS NULL OR a.id IS NULL OR q.id IS NULL
       OR f.primary_managed_system_id IS DISTINCT FROM h.primary_managed_system_id
       OR (f.source_type='survey_response' AND f.source_id IS DISTINCT FROM h.source_id))
  ) THEN RAISE EXCEPTION '0059 rejects orphan, cross-workspace or approval-response mismatched Survey history';
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE "survey"."finding_response_bindings" (
	"workspace_id" uuid NOT NULL,
	"finding_id" uuid PRIMARY KEY NOT NULL,
	"response_id" uuid NOT NULL,
	"historical_generated_title" text NOT NULL,
	"historical_generated_summary" text NOT NULL,
	CONSTRAINT "finding_bindings_workspace_parent_uq" UNIQUE("workspace_id","finding_id")
);
--> statement-breakpoint
CREATE TABLE "survey"."highlight_response_bindings" (
	"workspace_id" uuid NOT NULL,
	"highlight_id" uuid PRIMARY KEY NOT NULL,
	"response_id" uuid NOT NULL,
	"approved_excerpt_id" uuid NOT NULL,
	"approved_excerpt_snapshot" text NOT NULL,
	CONSTRAINT "highlight_bindings_workspace_parent_uq" UNIQUE("workspace_id","highlight_id")
);
--> statement-breakpoint
ALTER TABLE "finding"."evidence_highlights" DROP CONSTRAINT "evidence_highlights_source_id_required_check";--> statement-breakpoint
ALTER TABLE "finding"."findings" DROP CONSTRAINT "findings_source_id_required_check";--> statement-breakpoint
ALTER TABLE "finding"."evidence_highlights" ALTER COLUMN "quote_or_summary" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "finding"."evidence_highlights" ADD CONSTRAINT "evidence_highlights_workspace_id_uq" UNIQUE("workspace_id","id");--> statement-breakpoint
ALTER TABLE "finding"."findings" ADD CONSTRAINT "findings_workspace_id_uq" UNIQUE("workspace_id","id");--> statement-breakpoint
ALTER TABLE "survey"."survey_response_excerpt_approvals" ADD CONSTRAINT "excerpt_approvals_workspace_response_id_uq" UNIQUE("workspace_id","response_id","id");--> statement-breakpoint
ALTER TABLE "survey"."survey_responses" ADD CONSTRAINT "survey_responses_workspace_id_uq" UNIQUE("workspace_id","id");--> statement-breakpoint
ALTER TABLE "survey"."finding_response_bindings" ADD CONSTRAINT "finding_bindings_parent_fk" FOREIGN KEY ("workspace_id","finding_id") REFERENCES "finding"."findings"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey"."finding_response_bindings" ADD CONSTRAINT "finding_bindings_response_fk" FOREIGN KEY ("workspace_id","response_id") REFERENCES "survey"."survey_responses"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey"."highlight_response_bindings" ADD CONSTRAINT "highlight_bindings_parent_fk" FOREIGN KEY ("workspace_id","highlight_id") REFERENCES "finding"."evidence_highlights"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey"."highlight_response_bindings" ADD CONSTRAINT "highlight_bindings_approval_response_fk" FOREIGN KEY ("workspace_id","response_id","approved_excerpt_id") REFERENCES "survey"."survey_response_excerpt_approvals"("workspace_id","response_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey"."highlight_response_bindings" ADD CONSTRAINT "highlight_bindings_response_fk" FOREIGN KEY ("workspace_id","response_id") REFERENCES "survey"."survey_responses"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finding_bindings_workspace_response_idx" ON "survey"."finding_response_bindings" USING btree ("workspace_id","response_id","finding_id");--> statement-breakpoint
CREATE INDEX "highlight_bindings_workspace_response_idx" ON "survey"."highlight_response_bindings" USING btree ("workspace_id","response_id","highlight_id");--> statement-breakpoint
CREATE INDEX "highlight_bindings_workspace_approval_idx" ON "survey"."highlight_response_bindings" USING btree ("workspace_id","approved_excerpt_id");
--> statement-breakpoint
INSERT INTO survey.finding_response_bindings
  (workspace_id,finding_id,response_id,historical_generated_title,historical_generated_summary)
SELECT workspace_id,id,source_id,title,summary FROM finding.findings
WHERE source_type='survey_response';
--> statement-breakpoint
INSERT INTO survey.highlight_response_bindings
  (workspace_id,highlight_id,response_id,approved_excerpt_id,approved_excerpt_snapshot)
SELECT workspace_id,id,source_id,approved_excerpt_id,quote_or_summary
FROM finding.evidence_highlights WHERE source_type='survey_response';
--> statement-breakpoint
UPDATE finding.findings f SET
  source_id=NULL,
  title=COALESCE((SELECT q.prompt FROM finding.evidence_highlights h
     JOIN survey.survey_response_excerpt_approvals a ON a.id=h.approved_excerpt_id
     JOIN survey.survey_questions q ON q.id=a.question_id AND q.survey_id=a.survey_id
     WHERE h.workspace_id=f.workspace_id AND h.finding_id=f.id
     ORDER BY h.created_at,h.id LIMIT 1), 'Survey response') || ' · ' || s.type || ' · ' || s.display_id,
  summary='Survey response from ' || s.type || ' · ' || s.display_id
FROM survey.finding_response_bindings b
JOIN survey.survey_responses r ON r.workspace_id=b.workspace_id AND r.id=b.response_id
JOIN survey.surveys s ON s.workspace_id=r.workspace_id AND s.id=r.survey_id
WHERE b.workspace_id=f.workspace_id AND b.finding_id=f.id;
--> statement-breakpoint
UPDATE finding.evidence_highlights SET source_id=NULL,approved_excerpt_id=NULL,quote_or_summary=NULL
WHERE source_type='survey_response';
--> statement-breakpoint
-- Confirmed cached Finding DTOs (create/status/link), Task detail source.finding,
-- and typed provider source_summary/target_summary. No authored Task/Request prose.
DO $$
DECLARE c record; f record; body jsonb; path text[]; node jsonb;
BEGIN
  FOR c IN SELECT k.actor_id,k.key,k.response_body,a.workspace_id
      FROM core.idempotency_keys k JOIN core.actors a ON a.id=k.actor_id LOOP
    body := c.response_body;
    FOR path IN SELECT v FROM (VALUES (ARRAY[]::text[]), (ARRAY['source','finding']),
          (ARRAY['source_summary']), (ARRAY['target_summary'])) AS paths(v) LOOP
      node := CASE WHEN cardinality(path)=0 THEN body ELSE body #> path END;
      IF jsonb_typeof(node) IS DISTINCT FROM 'object' THEN CONTINUE; END IF;
      SELECT p.id,p.title,p.summary INTO f FROM finding.findings p
        JOIN survey.finding_response_bindings b ON b.workspace_id=p.workspace_id AND b.finding_id=p.id
        WHERE p.workspace_id=c.workspace_id AND p.id::text=node->>'id'
          AND ((cardinality(path)=0 AND node->>'source_type'='survey_response'
                AND node->>'workspace_id'=c.workspace_id::text)
            OR (path=ARRAY['source','finding'] AND body->>'workspace_id'=c.workspace_id::text
                AND body ? 'source_task_request_id')
            OR (cardinality(path)=1 AND node->>'type'='finding'
                AND body->>'workspace_id'=c.workspace_id::text));
      IF FOUND THEN
        node := (node - 'source_id') || jsonb_build_object('title',f.title,'summary',f.summary);
        body := CASE WHEN cardinality(path)=0 THEN node ELSE jsonb_set(body,path,node,false) END;
      END IF;
    END LOOP;
    IF body IS DISTINCT FROM c.response_body THEN
      UPDATE core.idempotency_keys SET response_body=body WHERE actor_id=c.actor_id AND key=c.key;
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE "finding"."evidence_highlights" ADD CONSTRAINT "evidence_highlights_source_id_required_check" CHECK (("finding"."evidence_highlights"."source_type" = 'survey_response' and "finding"."evidence_highlights"."source_id" is null and "finding"."evidence_highlights"."approved_excerpt_id" is null and "finding"."evidence_highlights"."quote_or_summary" is null) or ("finding"."evidence_highlights"."source_type" = 'note' and "finding"."evidence_highlights"."source_id" is null and "finding"."evidence_highlights"."approved_excerpt_id" is null and "finding"."evidence_highlights"."quote_or_summary" is not null) or ("finding"."evidence_highlights"."source_type" = 'voc' and "finding"."evidence_highlights"."source_id" is not null and "finding"."evidence_highlights"."approved_excerpt_id" is null and "finding"."evidence_highlights"."quote_or_summary" is not null));--> statement-breakpoint
ALTER TABLE "finding"."findings" ADD CONSTRAINT "findings_source_id_required_check" CHECK (("finding"."findings"."source_type" = 'survey_response' and "finding"."findings"."source_id" is null) or ("finding"."findings"."source_type" = 'manual') or ("finding"."findings"."source_type" in ('voc','voc_cluster','survey') and "finding"."findings"."source_id" is not null));
--> statement-breakpoint
-- Never grant the extensions through product-table defaults.
REVOKE ALL ON survey.finding_response_bindings, survey.highlight_response_bindings FROM PUBLIC, fops_app;
--> statement-breakpoint
GRANT USAGE ON SCHEMA survey, finding TO fops_survey_provenance_mutator_owner;
--> statement-breakpoint
GRANT USAGE ON SCHEMA finding TO fops_survey_evidence_reader_owner;
--> statement-breakpoint
GRANT SELECT (workspace_id,finding_id,response_id) ON survey.finding_response_bindings
  TO fops_survey_provenance_mutator_owner;
--> statement-breakpoint
GRANT SELECT (workspace_id,highlight_id,response_id,approved_excerpt_id,approved_excerpt_snapshot)
  ON survey.highlight_response_bindings
  TO fops_survey_evidence_reader_owner;
--> statement-breakpoint
GRANT SELECT (workspace_id,highlight_id,response_id) ON survey.highlight_response_bindings
  TO fops_survey_provenance_mutator_owner;
--> statement-breakpoint
GRANT SELECT (id,workspace_id,finding_id,source_type) ON finding.evidence_highlights
  TO fops_survey_evidence_reader_owner, fops_survey_provenance_mutator_owner;
--> statement-breakpoint
GRANT SELECT (primary_managed_system_id) ON finding.evidence_highlights
  TO fops_survey_provenance_mutator_owner;
--> statement-breakpoint
GRANT SELECT (id,workspace_id,source_type,title,summary,primary_managed_system_id) ON finding.findings
  TO fops_survey_provenance_mutator_owner;
--> statement-breakpoint
GRANT SELECT (id,workspace_id,survey_id) ON survey.survey_responses TO fops_survey_provenance_mutator_owner;
--> statement-breakpoint
GRANT SELECT (id,workspace_id) ON survey.surveys TO fops_survey_provenance_mutator_owner;
--> statement-breakpoint
GRANT SELECT (id,workspace_id,survey_id,response_id,question_id,redacted_excerpt,revoked_at)
  ON survey.survey_response_excerpt_approvals TO fops_survey_provenance_mutator_owner;
--> statement-breakpoint
GRANT SELECT (id,workspace_id,survey_id,kind) ON survey.survey_questions TO fops_survey_provenance_mutator_owner;
--> statement-breakpoint
GRANT INSERT ON survey.finding_response_bindings, survey.highlight_response_bindings
  TO fops_survey_provenance_mutator_owner;
--> statement-breakpoint
CREATE FUNCTION survey.bind_finding_response(p_workspace_id uuid,p_finding_id uuid,p_response_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_response_id::text,0));
  INSERT INTO survey.finding_response_bindings
    (workspace_id,finding_id,response_id,historical_generated_title,historical_generated_summary)
  SELECT f.workspace_id,f.id,r.id,f.title,f.summary FROM finding.findings f
    JOIN survey.survey_responses r ON r.id=p_response_id AND r.workspace_id=f.workspace_id
    JOIN survey.surveys s ON s.id=r.survey_id AND s.workspace_id=r.workspace_id
    WHERE f.workspace_id=p_workspace_id AND f.id=p_finding_id AND f.source_type='survey_response';
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid Finding response binding' USING ERRCODE='23514'; END IF;
  RETURN p_finding_id;
END $$;
--> statement-breakpoint
CREATE FUNCTION survey.bind_highlight_response(p_workspace_id uuid,p_highlight_id uuid,
  p_response_id uuid,p_approved_excerpt_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_response_id::text,0));
  INSERT INTO survey.highlight_response_bindings
    (workspace_id,highlight_id,response_id,approved_excerpt_id,approved_excerpt_snapshot)
  SELECT h.workspace_id,h.id,r.id,a.id,a.redacted_excerpt FROM finding.evidence_highlights h
    JOIN finding.findings f ON f.id=h.finding_id AND f.workspace_id=h.workspace_id
      AND f.primary_managed_system_id=h.primary_managed_system_id
    JOIN survey.survey_responses r ON r.id=p_response_id AND r.workspace_id=h.workspace_id
    JOIN survey.surveys s ON s.id=r.survey_id AND s.workspace_id=r.workspace_id
    JOIN survey.survey_response_excerpt_approvals a ON a.id=p_approved_excerpt_id
      AND a.workspace_id=r.workspace_id AND a.response_id=r.id AND a.survey_id=r.survey_id
    JOIN survey.survey_questions q ON q.id=a.question_id AND q.survey_id=a.survey_id
      AND q.workspace_id=a.workspace_id AND q.kind='text'
    WHERE h.workspace_id=p_workspace_id AND h.id=p_highlight_id
      AND h.source_type='survey_response' AND a.revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid or revoked highlight approval' USING ERRCODE='23514'; END IF;
  RETURN p_highlight_id;
END $$;
--> statement-breakpoint
-- Returns no response/approval IDs. The application must authorize the target and
-- each returned source Managed System before serializing text. Locks sorted response
-- UUIDs, then uses a fresh READ COMMITTED statement snapshot after any revoke wait.
CREATE FUNCTION survey.read_finding_highlight_evidence(p_workspace_id uuid,p_finding_id uuid,
  p_highlight_ids uuid[])
RETURNS TABLE(highlight_id uuid,primary_managed_system_id uuid,survey_type text,
  survey_display_id text,identity_protected boolean,question_label text,approved_excerpt_snapshot text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE response_uuid uuid;
BEGIN
  FOR response_uuid IN SELECT DISTINCT b.response_id FROM survey.highlight_response_bindings b
    JOIN finding.evidence_highlights h ON h.workspace_id=b.workspace_id AND h.id=b.highlight_id
    WHERE b.workspace_id=p_workspace_id AND h.finding_id=p_finding_id
      AND h.id=ANY(p_highlight_ids) ORDER BY b.response_id LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(response_uuid::text,0));
  END LOOP;
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
    WHERE b.workspace_id=p_workspace_id AND h.finding_id=p_finding_id
      AND h.id=ANY(p_highlight_ids) AND h.source_type='survey_response'
      AND s.status<>'draft' AND a.revoked_at IS NULL ORDER BY h.id;
END $$;
--> statement-breakpoint
-- Deferred checks cover both public parent insertion and protected extension edits.
-- No membership or public EXECUTE is needed for a trigger invocation.
CREATE FUNCTION survey.check_finding_response_binding()
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
      WHERE f.finding_id=parent_id AND f.workspace_id=parent_workspace AND b.response_id<>f.response_id)
    OR EXISTS (SELECT 1 FROM finding.findings f
      JOIN finding.evidence_highlights h ON h.finding_id=f.id
      WHERE f.id=parent_id AND f.workspace_id=parent_workspace AND h.source_type='survey_response'
        AND (f.workspace_id<>h.workspace_id OR f.primary_managed_system_id<>h.primary_managed_system_id))
  THEN RAISE EXCEPTION 'Survey Finding requires exactly one private binding' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE FUNCTION survey.check_highlight_response_binding()
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
      JOIN survey.finding_response_bindings f ON f.finding_id=h.finding_id AND f.workspace_id=h.workspace_id
      WHERE h.id=parent_id AND h.workspace_id=parent_workspace AND b.response_id<>f.response_id)
    OR EXISTS (SELECT 1 FROM finding.evidence_highlights h
      LEFT JOIN finding.findings f ON f.id=h.finding_id AND f.workspace_id=h.workspace_id
      WHERE h.id=parent_id AND h.workspace_id=parent_workspace AND h.source_type='survey_response'
        AND (f.id IS NULL OR f.primary_managed_system_id<>h.primary_managed_system_id))
  THEN RAISE EXCEPTION 'Survey highlight requires a consistent private binding' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER findings_private_binding_check AFTER INSERT OR UPDATE ON finding.findings
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION survey.check_finding_response_binding();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER finding_bindings_parent_check AFTER INSERT OR UPDATE OR DELETE ON survey.finding_response_bindings
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION survey.check_finding_response_binding();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER highlights_private_binding_check AFTER INSERT OR UPDATE ON finding.evidence_highlights
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION survey.check_highlight_response_binding();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER highlight_bindings_parent_check AFTER INSERT OR UPDATE OR DELETE ON survey.highlight_response_bindings
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION survey.check_highlight_response_binding();
--> statement-breakpoint
GRANT CREATE ON SCHEMA survey TO fops_survey_provenance_mutator_owner,fops_survey_evidence_reader_owner;
--> statement-breakpoint
ALTER FUNCTION survey.bind_finding_response(uuid,uuid,uuid) OWNER TO fops_survey_provenance_mutator_owner;
--> statement-breakpoint
ALTER FUNCTION survey.bind_highlight_response(uuid,uuid,uuid,uuid) OWNER TO fops_survey_provenance_mutator_owner;
--> statement-breakpoint
ALTER FUNCTION survey.check_finding_response_binding() OWNER TO fops_survey_provenance_mutator_owner;
--> statement-breakpoint
ALTER FUNCTION survey.check_highlight_response_binding() OWNER TO fops_survey_provenance_mutator_owner;
--> statement-breakpoint
ALTER FUNCTION survey.read_finding_highlight_evidence(uuid,uuid,uuid[]) OWNER TO fops_survey_evidence_reader_owner;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA survey FROM fops_survey_provenance_mutator_owner,fops_survey_evidence_reader_owner;
--> statement-breakpoint
SET ROLE fops_survey_provenance_mutator_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION survey.bind_finding_response(uuid,uuid,uuid),
  survey.bind_highlight_response(uuid,uuid,uuid,uuid),survey.check_finding_response_binding(),
  survey.check_highlight_response_binding() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION survey.bind_finding_response(uuid,uuid,uuid),
  survey.bind_highlight_response(uuid,uuid,uuid,uuid) TO fops_app;
--> statement-breakpoint
RESET ROLE;
--> statement-breakpoint
SET ROLE fops_survey_evidence_reader_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION survey.read_finding_highlight_evidence(uuid,uuid,uuid[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION survey.read_finding_highlight_evidence(uuid,uuid,uuid[]) TO fops_app;
--> statement-breakpoint
RESET ROLE;
