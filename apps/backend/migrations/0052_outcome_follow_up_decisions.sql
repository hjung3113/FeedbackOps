-- #510 part B (ADR-0055): outcome follow-up decision state + poor-result
-- classifier + narrowed gap predicate, in one migration so the dashboard
-- count cannot lie between the table and the predicate.
--
-- Behavior changes vs 0046, by decision:
--   * Poor = low band of getRatingBandForValue (thirds; remainder to low,
--     then mid) — not answer_value <= rating_min.
--   * Only CLOSED outcome surveys are classified; open/draft never count.
--   * The workspace survey_anonymity_threshold excludes small cohorts
--     entirely (ADR-0033): below-threshold surveys are not counted, not poor.
--   * Resolution requires an ACTIVE generated_finding link whose Finding's
--     CURRENT status is draft/active/converted (not_actionable and archived
--     reopen the gap), OR a current no_follow_up decision. evidence_of links
--     no longer clear the gap (08-dashboard-system.md: evidence attachment is
--     context enrichment), and the dead target_type='task' branch is dropped
--     because the link registry has no survey_response -> task pair.
--
-- Issue #217 boundary unchanged: the classifier and the count stay
-- aggregate/state-only. Answer values, text, and respondent identity never
-- cross this privilege boundary.

CREATE TABLE "survey"."outcome_follow_up_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"survey_id" uuid NOT NULL,
	"response_id" uuid NOT NULL,
	"managed_system_id" uuid NOT NULL,
	"state" text NOT NULL,
	"reason" text NOT NULL,
	"decided_by_actor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outcome_follow_up_decisions_state_check" CHECK ("survey"."outcome_follow_up_decisions"."state" IN ('no_follow_up','reopened')),
	CONSTRAINT "outcome_follow_up_decisions_reason_nonempty" CHECK ("survey"."outcome_follow_up_decisions"."reason" <> ''),
	CONSTRAINT "outcome_follow_up_decisions_workspace_response_uq" UNIQUE ("workspace_id","response_id")
);
--> statement-breakpoint
ALTER TABLE "survey"."outcome_follow_up_decisions" ADD CONSTRAINT "outcome_follow_up_decisions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey"."outcome_follow_up_decisions" ADD CONSTRAINT "outcome_follow_up_decisions_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "survey"."surveys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey"."outcome_follow_up_decisions" ADD CONSTRAINT "outcome_follow_up_decisions_managed_system_id_managed_systems_id_fk" FOREIGN KEY ("managed_system_id") REFERENCES "core"."managed_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey"."outcome_follow_up_decisions" ADD CONSTRAINT "outcome_follow_up_decisions_decided_by_actor_id_actors_id_fk" FOREIGN KEY ("decided_by_actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey"."outcome_follow_up_decisions" ADD CONSTRAINT "outcome_follow_up_decisions_response_survey_fk" FOREIGN KEY ("survey_id","response_id") REFERENCES "survey"."survey_responses"("survey_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
GRANT ALL ON "survey"."outcome_follow_up_decisions" TO fops_migrate;
--> statement-breakpoint
-- ADR-0055 storage option (b): one current row per response. fops_app may
-- insert and transition it in place (the voc.voc_recommendation_decisions
-- precedent) but never erase a recorded decision: no DELETE, and UPDATE only
-- on the columns the mark/reopen transitions actually write.
GRANT SELECT, INSERT ON "survey"."outcome_follow_up_decisions" TO fops_app;
--> statement-breakpoint
GRANT UPDATE ("state","reason","decided_by_actor_id","updated_at") ON "survey"."outcome_follow_up_decisions" TO fops_app;
--> statement-breakpoint

-- Least-privilege extensions for fops_survey_aggregate_owner. Existing grants
-- (0038/0046) already cover survey/response/answer ids, survey type and
-- primary Managed System, question kind/rating_min, and the entity_links
-- columns status/source/target; only what the new predicate reads is added.
GRANT SELECT ("status") ON "survey"."surveys" TO fops_survey_aggregate_owner;
--> statement-breakpoint
GRANT SELECT ("rating_max") ON "survey"."survey_questions" TO fops_survey_aggregate_owner;
--> statement-breakpoint
GRANT SELECT ("relation_type", "target_id") ON "core"."entity_links"
  TO fops_survey_aggregate_owner;
--> statement-breakpoint
GRANT USAGE ON SCHEMA "finding" TO fops_survey_aggregate_owner;
--> statement-breakpoint
GRANT SELECT ("id", "workspace_id", "status") ON "finding"."findings"
  TO fops_survey_aggregate_owner;
--> statement-breakpoint
GRANT SELECT ("workspace_id", "survey_anonymity_threshold") ON "core"."workspace_settings"
  TO fops_survey_aggregate_owner;
--> statement-breakpoint
GRANT SELECT ("workspace_id", "response_id", "state") ON "survey"."outcome_follow_up_decisions"
  TO fops_survey_aggregate_owner;
--> statement-breakpoint

-- Band parity target: the SQL twin of getRatingBandForValue. Each band gets
-- floor(n / 3) values, remainder first to low then mid, so a mid band of size
-- zero is unreachable in practice and the size guard is unnecessary: when mid
-- is empty, mid_max equals low_max and the value cannot match either arm.
CREATE FUNCTION "survey"."rating_band_for_value"(
  p_min integer,
  p_max integer,
  p_value integer
)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_value <= p_min
      + ((p_max - p_min + 1) / 3)
      + (CASE WHEN (p_max - p_min + 1) % 3 > 0 THEN 1 ELSE 0 END)
      - 1
      THEN 'low'
    WHEN p_value <= p_min
      + 2 * ((p_max - p_min + 1) / 3)
      + (CASE WHEN (p_max - p_min + 1) % 3 > 0 THEN 1 ELSE 0 END)
      + (CASE WHEN (p_max - p_min + 1) % 3 > 1 THEN 1 ELSE 0 END)
      - 1
      THEN 'mid'
    ELSE 'high'
  END
$$;
--> statement-breakpoint

-- Per-response classifier. Returns only classification and resolution state;
-- never answer values, text, or respondent identity. Called by the surveys
-- module exclusively behind the audited personal-response seam.
CREATE FUNCTION "survey"."read_outcome_follow_up_state"(
  p_workspace_id uuid,
  p_response_id uuid
)
RETURNS TABLE(
  survey_id uuid,
  survey_status text,
  is_outcome boolean,
  meets_threshold boolean,
  is_poor boolean,
  resolution text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  WITH subject AS (
    SELECT
      s.id AS subject_survey_id,
      s.status AS subject_survey_status,
      (s.type = 'outcome') AS subject_is_outcome,
      (
        SELECT pg_catalog.count(*)
          FROM survey.survey_responses AS rc
         WHERE rc.workspace_id = s.workspace_id
           AND rc.survey_id = s.id
      ) AS subject_response_count,
      COALESCE(
        (
          SELECT ws.survey_anonymity_threshold
            FROM core.workspace_settings AS ws
           WHERE ws.workspace_id = s.workspace_id
        ),
        5
      ) AS subject_threshold
    FROM survey.surveys AS s
    JOIN survey.survey_responses AS r
      ON r.survey_id = s.id
     AND r.workspace_id = s.workspace_id
   WHERE s.workspace_id = p_workspace_id
     AND r.id = p_response_id
  )
  SELECT
    subject.subject_survey_id,
    subject.subject_survey_status,
    subject.subject_is_outcome,
    (subject.subject_response_count >= subject.subject_threshold) AS meets_threshold,
    (
      subject.subject_is_outcome
      AND subject.subject_survey_status = 'closed'
      AND subject.subject_response_count >= subject.subject_threshold
      AND EXISTS (
        SELECT 1
          FROM survey.survey_response_answers AS a
          JOIN survey.survey_questions AS q
            ON q.id = a.question_id
           AND q.survey_id = a.survey_id
           AND q.workspace_id = a.workspace_id
         WHERE a.workspace_id = p_workspace_id
           AND a.response_id = p_response_id
           AND q.kind = 'rating'
           AND a.answer_kind = 'rating'
           AND survey.rating_band_for_value(
                 q.rating_min,
                 q.rating_max,
                 (a.answer_value #>> '{}')::integer
               ) = 'low'
      )
    ) AS is_poor,
    CASE
      WHEN EXISTS (
        SELECT 1
          FROM core.entity_links AS el
          JOIN finding.findings AS f
            ON f.id = el.target_id
           AND f.workspace_id = el.workspace_id
         WHERE el.workspace_id = p_workspace_id
           AND el.status = 'active'
           AND el.source_type = 'survey_response'
           AND el.source_id = p_response_id
           AND el.target_type = 'finding'
           AND el.relation_type = 'generated_finding'
           AND f.status IN ('draft', 'active', 'converted')
      ) THEN 'finding'
      WHEN EXISTS (
        SELECT 1
          FROM survey.outcome_follow_up_decisions AS d
         WHERE d.workspace_id = p_workspace_id
           AND d.response_id = p_response_id
           AND d.state = 'no_follow_up'
      ) THEN 'no_follow_up'
      ELSE 'open'
    END AS resolution
  FROM subject
$$;
--> statement-breakpoint

-- Replacement gap predicate, same signature and aggregate-only contract.
DROP FUNCTION "survey"."count_negative_outcome_without_followup"(uuid, uuid[]);
--> statement-breakpoint
CREATE FUNCTION "survey"."count_negative_outcome_without_followup"(
  p_workspace_id uuid,
  p_managed_system_ids uuid[]
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT pg_catalog.count(DISTINCT r.id)
    FROM survey.surveys AS s
    JOIN survey.survey_responses AS r
      ON r.survey_id = s.id
     AND r.workspace_id = s.workspace_id
   WHERE s.workspace_id = p_workspace_id
     AND s.type = 'outcome'
     AND s.status = 'closed'
     AND (
       p_managed_system_ids IS NULL
       OR pg_catalog.cardinality(p_managed_system_ids) = 0
       OR s.primary_managed_system_id = ANY(p_managed_system_ids)
     )
     AND (
       SELECT pg_catalog.count(*)
         FROM survey.survey_responses AS rc
        WHERE rc.workspace_id = s.workspace_id
          AND rc.survey_id = s.id
     ) >= COALESCE(
           (
             SELECT ws.survey_anonymity_threshold
               FROM core.workspace_settings AS ws
              WHERE ws.workspace_id = s.workspace_id
           ),
           5
         )
     AND EXISTS (
       SELECT 1
         FROM survey.survey_response_answers AS a
         JOIN survey.survey_questions AS q
           ON q.id = a.question_id
          AND q.survey_id = a.survey_id
          AND q.workspace_id = a.workspace_id
        WHERE a.workspace_id = r.workspace_id
          AND a.survey_id = r.survey_id
          AND a.response_id = r.id
          AND q.kind = 'rating'
          AND a.answer_kind = 'rating'
          AND survey.rating_band_for_value(
                q.rating_min,
                q.rating_max,
                (a.answer_value #>> '{}')::integer
              ) = 'low'
     )
     AND NOT EXISTS (
       SELECT 1
         FROM core.entity_links AS el
         JOIN finding.findings AS f
           ON f.id = el.target_id
          AND f.workspace_id = el.workspace_id
        WHERE el.workspace_id = r.workspace_id
          AND el.status = 'active'
          AND el.source_type = 'survey_response'
          AND el.source_id = r.id
          AND el.target_type = 'finding'
          AND el.relation_type = 'generated_finding'
          AND f.status IN ('draft', 'active', 'converted')
     )
     AND NOT EXISTS (
       SELECT 1
         FROM survey.outcome_follow_up_decisions AS d
        WHERE d.workspace_id = r.workspace_id
          AND d.response_id = r.id
          AND d.state = 'no_follow_up'
     )
$$;
--> statement-breakpoint

-- PostgreSQL requires temporary CREATE on the containing schema to transfer
-- ownership. It is revoked immediately after the transfers complete.
GRANT CREATE ON SCHEMA "survey" TO fops_survey_aggregate_owner;
--> statement-breakpoint
ALTER FUNCTION "survey"."rating_band_for_value"(integer, integer, integer)
  OWNER TO fops_survey_aggregate_owner;
--> statement-breakpoint
ALTER FUNCTION "survey"."read_outcome_follow_up_state"(uuid, uuid)
  OWNER TO fops_survey_aggregate_owner;
--> statement-breakpoint
ALTER FUNCTION "survey"."count_negative_outcome_without_followup"(uuid, uuid[])
  OWNER TO fops_survey_aggregate_owner;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA "survey" FROM fops_survey_aggregate_owner;
--> statement-breakpoint
SET ROLE fops_survey_aggregate_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "survey"."rating_band_for_value"(integer, integer, integer) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "survey"."read_outcome_follow_up_state"(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "survey"."count_negative_outcome_without_followup"(uuid, uuid[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "survey"."rating_band_for_value"(integer, integer, integer) TO fops_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "survey"."read_outcome_follow_up_state"(uuid, uuid) TO fops_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "survey"."count_negative_outcome_without_followup"(uuid, uuid[]) TO fops_app;
--> statement-breakpoint
RESET ROLE;
