-- #510 part C (ADR-0055): outcome follow-up READ surface. Two new
-- SECURITY DEFINER functions, no table:
--   * survey.read_outcome_follow_up_survey_state — survey-grain booleans
--     only (classifiable, follow_up_needed). Safe for any survey.read
--     caller: no counts, no response ids, no per-response flags, so a
--     non-holder of survey.read_personal_responses cannot subtract.
--   * survey.read_outcome_follow_up_items_personal — per-poor-response
--     review rows (response id, 1-based submission ordinal, low-band
--     answers with question label and bounds, resolution, qualifying
--     Finding, current decision). Personal data: the surveys module may
--     call it only after the audited personal-response seam.
--
-- Owner choice: fops_survey_aggregate_owner, not the evidence-reader
-- owner. Its existing grants (0038/0046/0052) already cover the whole
-- ADR-0055 classifier predicate — survey type/status, response and answer
-- ids/values, question rating bounds, entity_links resolution columns,
-- Finding status, workspace threshold, decision state — so the items
-- reader extends the same classification boundary with only the display
-- columns the review list needs. The evidence-reader owner's boundary is
-- raw-text/excerpt access, which this read never crosses: no text answers,
-- no excerpts, no respondent actor ids are returned.
--
-- Both functions reuse survey.rating_band_for_value and the SAME predicate
-- as survey.read_outcome_follow_up_state (closed outcome survey, workspace
-- threshold, low band, resolution precedence finding > no_follow_up > open).

-- Least-privilege display-column extensions for fops_survey_aggregate_owner.
GRANT SELECT ("submitted_at") ON "survey"."survey_responses"
  TO fops_survey_aggregate_owner;
--> statement-breakpoint
GRANT SELECT ("prompt", "sort_order") ON "survey"."survey_questions"
  TO fops_survey_aggregate_owner;
--> statement-breakpoint
GRANT SELECT ("reason", "updated_at") ON "survey"."outcome_follow_up_decisions"
  TO fops_survey_aggregate_owner;
--> statement-breakpoint
GRANT SELECT ("created_at", "display_id") ON "finding"."findings"
  TO fops_survey_aggregate_owner;
--> statement-breakpoint

-- Survey-grain flags. Returns one row for an existing workspace survey:
-- classifiable = outcome + closed + total responses >= workspace threshold;
-- follow_up_needed = classifiable + at least one poor response whose
-- resolution is currently 'open'. The type guard is defense in depth; the
-- route 404s non-outcome surveys before calling this.
CREATE FUNCTION "survey"."read_outcome_follow_up_survey_state"(
  p_workspace_id uuid,
  p_survey_id uuid
)
RETURNS TABLE(
  classifiable boolean,
  follow_up_needed boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  WITH subject AS (
    SELECT
      (s.type = 'outcome') AS subject_is_outcome,
      (s.status = 'closed') AS subject_is_closed,
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
    WHERE s.workspace_id = p_workspace_id
      AND s.id = p_survey_id
  )
  SELECT
    (
      subject.subject_is_outcome
        AND subject.subject_is_closed
        AND subject.subject_response_count >= subject.subject_threshold
    ) AS classifiable,
    (
      subject.subject_is_outcome
        AND subject.subject_is_closed
        AND subject.subject_response_count >= subject.subject_threshold
        AND EXISTS (
          SELECT 1
            FROM survey.survey_responses AS r
           WHERE r.workspace_id = p_workspace_id
             AND r.survey_id = p_survey_id
             AND EXISTS (
               SELECT 1
                 FROM survey.survey_response_answers AS a
                 JOIN survey.survey_questions AS q
                   ON q.id = a.question_id
                  AND q.survey_id = a.survey_id
                  AND q.workspace_id = a.workspace_id
                 WHERE a.workspace_id = p_workspace_id
                   AND a.survey_id = p_survey_id
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
                 WHERE el.workspace_id = p_workspace_id
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
                WHERE d.workspace_id = p_workspace_id
                  AND d.response_id = r.id
                  AND d.state = 'no_follow_up'
             )
        )
    ) AS follow_up_needed
  FROM subject
$$;
--> statement-breakpoint

-- Personal review rows: one row per (poor response, low-band answer), with
-- the response-grain fields repeated across its low answers. The service
-- groups by response_id; rows are ordered by response_number (the 1-based
-- (submitted_at, id) ordinal over ALL responses of the survey), then
-- question sort_order. Never returns text answers, excerpts, or respondent
-- actor ids. The qualifying Finding is the earliest-created live
-- generated_finding (deterministic when several exist); resolution follows
-- the read_outcome_follow_up_state precedence exactly.
CREATE FUNCTION "survey"."read_outcome_follow_up_items_personal"(
  p_workspace_id uuid,
  p_survey_id uuid
)
RETURNS TABLE(
  response_id uuid,
  response_number integer,
  submitted_at timestamptz,
  question_id uuid,
  question_label text,
  answer_value integer,
  rating_min integer,
  rating_max integer,
  resolution text,
  finding_id uuid,
  finding_display_id text,
  finding_status text,
  decision_state text,
  decision_reason text,
  decision_updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  WITH subject AS (
    SELECT
      (s.type = 'outcome') AS subject_is_outcome,
      (s.status = 'closed') AS subject_is_closed,
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
    WHERE s.workspace_id = p_workspace_id
      AND s.id = p_survey_id
  ),
  ranked AS (
    SELECT
      r.id AS ranked_response_id,
      r.submitted_at AS ranked_submitted_at,
      pg_catalog.row_number() OVER (ORDER BY r.submitted_at, r.id) AS ranked_number
    FROM survey.survey_responses AS r
    WHERE r.workspace_id = p_workspace_id
      AND r.survey_id = p_survey_id
  ),
  poor AS (
    SELECT
      ranked.ranked_response_id,
      ranked.ranked_submitted_at,
      ranked.ranked_number
    FROM ranked
    JOIN subject
      ON subject.subject_is_outcome
     AND subject.subject_is_closed
     AND subject.subject_response_count >= subject.subject_threshold
    WHERE EXISTS (
      SELECT 1
        FROM survey.survey_response_answers AS a
        JOIN survey.survey_questions AS q
          ON q.id = a.question_id
         AND q.survey_id = a.survey_id
         AND q.workspace_id = a.workspace_id
       WHERE a.workspace_id = p_workspace_id
         AND a.survey_id = p_survey_id
         AND a.response_id = ranked.ranked_response_id
         AND q.kind = 'rating'
         AND a.answer_kind = 'rating'
         AND survey.rating_band_for_value(
               q.rating_min,
               q.rating_max,
               (a.answer_value #>> '{}')::integer
             ) = 'low'
    )
  ),
  classified AS (
    SELECT
      poor.ranked_response_id,
      poor.ranked_number,
      poor.ranked_submitted_at,
      live_finding.qualifying_finding_id,
      live_finding.qualifying_display_id,
      live_finding.qualifying_status,
      current_decision.current_state,
      current_decision.current_reason,
      current_decision.current_updated_at,
      CASE
        WHEN live_finding.qualifying_finding_id IS NOT NULL THEN 'finding'
        WHEN current_decision.current_state = 'no_follow_up' THEN 'no_follow_up'
        ELSE 'open'
      END AS resolution
    FROM poor
    LEFT JOIN LATERAL (
      SELECT
        f.id AS qualifying_finding_id,
        f.display_id AS qualifying_display_id,
        f.status AS qualifying_status
      FROM core.entity_links AS el
      JOIN finding.findings AS f
        ON f.id = el.target_id
       AND f.workspace_id = el.workspace_id
      WHERE el.workspace_id = p_workspace_id
        AND el.status = 'active'
        AND el.source_type = 'survey_response'
        AND el.source_id = poor.ranked_response_id
        AND el.target_type = 'finding'
        AND el.relation_type = 'generated_finding'
        AND f.status IN ('draft', 'active', 'converted')
      ORDER BY f.created_at, f.id
      LIMIT 1
    ) AS live_finding ON true
    LEFT JOIN LATERAL (
      SELECT
        d.state AS current_state,
        d.reason AS current_reason,
        d.updated_at AS current_updated_at
      FROM survey.outcome_follow_up_decisions AS d
      WHERE d.workspace_id = p_workspace_id
        AND d.response_id = poor.ranked_response_id
      LIMIT 1
    ) AS current_decision ON true
  )
  SELECT
    classified.ranked_response_id,
    classified.ranked_number,
    classified.ranked_submitted_at,
    q.id AS question_id,
    q.prompt AS question_label,
    (a.answer_value #>> '{}')::integer AS answer_value,
    q.rating_min,
    q.rating_max,
    classified.resolution,
    classified.qualifying_finding_id,
    classified.qualifying_display_id,
    classified.qualifying_status,
    classified.current_state,
    classified.current_reason,
    classified.current_updated_at
  FROM classified
  JOIN survey.survey_response_answers AS a
    ON a.workspace_id = p_workspace_id
   AND a.survey_id = p_survey_id
   AND a.response_id = classified.ranked_response_id
  JOIN survey.survey_questions AS q
    ON q.id = a.question_id
   AND q.survey_id = a.survey_id
   AND q.workspace_id = a.workspace_id
  WHERE q.kind = 'rating'
    AND a.answer_kind = 'rating'
    AND survey.rating_band_for_value(
          q.rating_min,
          q.rating_max,
          (a.answer_value #>> '{}')::integer
        ) = 'low'
  ORDER BY classified.ranked_number, q.sort_order, q.id
$$;
--> statement-breakpoint

-- PostgreSQL requires temporary CREATE on the containing schema to transfer
-- ownership. It is revoked immediately after the transfers complete.
GRANT CREATE ON SCHEMA "survey" TO fops_survey_aggregate_owner;
--> statement-breakpoint
ALTER FUNCTION "survey"."read_outcome_follow_up_survey_state"(uuid, uuid)
  OWNER TO fops_survey_aggregate_owner;
--> statement-breakpoint
ALTER FUNCTION "survey"."read_outcome_follow_up_items_personal"(uuid, uuid)
  OWNER TO fops_survey_aggregate_owner;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA "survey" FROM fops_survey_aggregate_owner;
--> statement-breakpoint
SET ROLE fops_survey_aggregate_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "survey"."read_outcome_follow_up_survey_state"(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "survey"."read_outcome_follow_up_items_personal"(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "survey"."read_outcome_follow_up_survey_state"(uuid, uuid) TO fops_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "survey"."read_outcome_follow_up_items_personal"(uuid, uuid) TO fops_app;
--> statement-breakpoint
RESET ROLE;
