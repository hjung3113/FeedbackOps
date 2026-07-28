-- Existing environments must run these prerequisites before applying this migration:
--   CREATE ROLE fops_survey_aggregate_owner WITH NOLOGIN NOINHERIT;
--   GRANT fops_survey_aggregate_owner TO fops_migrate;
-- See scripts/db/init.sql for the empty-database bootstrap equivalent.
--
-- Issue #217: dashboard outcome-follow-up counts remain aggregate-only. Text
-- answer bodies and response identities must never cross this privilege boundary.

-- PostgreSQL requires temporary CREATE on the containing schema to transfer
-- ownership. It is revoked immediately after the transfer completes.
GRANT CREATE ON SCHEMA "survey" TO fops_survey_aggregate_owner;
--> statement-breakpoint
GRANT SELECT ("type", "primary_managed_system_id") ON "survey"."surveys"
  TO fops_survey_aggregate_owner;
--> statement-breakpoint
GRANT SELECT ("rating_min") ON "survey"."survey_questions"
  TO fops_survey_aggregate_owner;
--> statement-breakpoint
GRANT USAGE ON SCHEMA "core" TO fops_survey_aggregate_owner;
--> statement-breakpoint
GRANT SELECT ("workspace_id", "status", "source_type", "source_id", "target_type")
  ON "core"."entity_links" TO fops_survey_aggregate_owner;
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
    JOIN survey.survey_response_answers AS a
      ON a.survey_id = r.survey_id
     AND a.response_id = r.id
     AND a.workspace_id = r.workspace_id
    JOIN survey.survey_questions AS q
      ON q.id = a.question_id
     AND q.survey_id = a.survey_id
     AND q.workspace_id = a.workspace_id
   WHERE s.workspace_id = p_workspace_id
     AND s.type = 'outcome'
     AND q.kind = 'rating'
     AND a.answer_kind = 'rating'
     AND (a.answer_value #>> '{}')::numeric <= q.rating_min
     AND (
       p_managed_system_ids IS NULL
       OR pg_catalog.cardinality(p_managed_system_ids) = 0
       OR s.primary_managed_system_id = ANY(p_managed_system_ids)
     )
     AND NOT EXISTS (
       SELECT 1
         FROM core.entity_links AS el
        WHERE el.workspace_id = r.workspace_id
          AND el.status = 'active'
          AND el.source_type = 'survey_response'
          AND el.source_id = r.id
          AND el.target_type IN ('finding', 'task')
     )
$$;
--> statement-breakpoint

ALTER FUNCTION "survey"."count_negative_outcome_without_followup"(uuid, uuid[])
  OWNER TO fops_survey_aggregate_owner;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA "survey" FROM fops_survey_aggregate_owner;
--> statement-breakpoint
SET ROLE fops_survey_aggregate_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "survey"."count_negative_outcome_without_followup"(uuid, uuid[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "survey"."count_negative_outcome_without_followup"(uuid, uuid[]) TO fops_app;
--> statement-breakpoint
RESET ROLE;
