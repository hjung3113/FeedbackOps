-- Issue #186: aggregate-only survey result read interface. Text answers deliberately
-- produce no rows: their bodies must never cross this database privilege boundary.

-- PostgreSQL requires CREATE on the containing schema to transfer ownership.
-- The NOLOGIN role otherwise receives only the column reads declared below.
GRANT USAGE, CREATE ON SCHEMA "survey" TO fops_survey_aggregate_owner;
--> statement-breakpoint
GRANT SELECT ("id", "workspace_id") ON "survey"."surveys" TO fops_survey_aggregate_owner;
--> statement-breakpoint
GRANT SELECT ("id", "workspace_id", "survey_id") ON "survey"."survey_responses" TO fops_survey_aggregate_owner;
--> statement-breakpoint
GRANT SELECT ("id", "workspace_id", "survey_id", "kind") ON "survey"."survey_questions" TO fops_survey_aggregate_owner;
--> statement-breakpoint
GRANT SELECT ("workspace_id", "survey_id", "response_id", "question_id", "answer_kind", "answer_value")
  ON "survey"."survey_response_answers" TO fops_survey_aggregate_owner;
--> statement-breakpoint

CREATE FUNCTION "survey"."read_result_aggregates"(p_workspace_id uuid, p_survey_id uuid)
RETURNS TABLE(question_id uuid, question_kind text, bucket_key text, bucket_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  WITH valid_answers AS (
    SELECT a.question_id, q.kind AS question_kind, a.answer_kind, a.answer_value
      FROM survey.surveys AS s
      JOIN survey.survey_responses AS r
        ON r.survey_id = s.id
       AND r.workspace_id = s.workspace_id
      JOIN survey.survey_response_answers AS a
        ON a.survey_id = r.survey_id
       AND a.response_id = r.id
       AND a.workspace_id = r.workspace_id
      JOIN survey.survey_questions AS q
        ON q.id = a.question_id
       AND q.survey_id = a.survey_id
       AND q.workspace_id = a.workspace_id
     WHERE s.workspace_id = p_workspace_id
       AND s.id = p_survey_id
       AND a.answer_kind = q.kind
       AND a.answer_kind IN ('single_choice', 'multiple_choice', 'rating')
  ), buckets AS (
    SELECT question_id, question_kind, answer_value #>> '{}' AS bucket_key
      FROM valid_answers
     WHERE answer_kind IN ('single_choice', 'rating')
    UNION ALL
    SELECT valid_answers.question_id, valid_answers.question_kind, option_value.bucket_key
      FROM valid_answers
      CROSS JOIN LATERAL pg_catalog.jsonb_array_elements_text(valid_answers.answer_value)
        AS option_value(bucket_key)
     WHERE valid_answers.answer_kind = 'multiple_choice'
  )
  SELECT question_id, question_kind, bucket_key, pg_catalog.count(*) AS bucket_count
    FROM buckets
   GROUP BY question_id, question_kind, bucket_key
$$;
--> statement-breakpoint

CREATE FUNCTION "survey"."read_result_response_count"(p_workspace_id uuid, p_survey_id uuid)
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
     AND s.id = p_survey_id
$$;
--> statement-breakpoint

ALTER FUNCTION "survey"."read_result_aggregates"(uuid, uuid) OWNER TO fops_survey_aggregate_owner;
--> statement-breakpoint
ALTER FUNCTION "survey"."read_result_response_count"(uuid, uuid) OWNER TO fops_survey_aggregate_owner;
--> statement-breakpoint
SET ROLE fops_survey_aggregate_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "survey"."read_result_aggregates"(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "survey"."read_result_response_count"(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "survey"."read_result_aggregates"(uuid, uuid) TO fops_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "survey"."read_result_response_count"(uuid, uuid) TO fops_app;
--> statement-breakpoint
RESET ROLE;
