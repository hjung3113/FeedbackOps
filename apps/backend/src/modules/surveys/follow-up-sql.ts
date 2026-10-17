import { type SQL, sql } from 'drizzle-orm';

/** Aggregate-only classifier invocation; callers own scope and status predicates. */
export function surveyFollowUpStateLateral(workspaceId: string, surveyId: SQL): SQL {
  return sql`CROSS JOIN LATERAL survey.read_outcome_follow_up_survey_state(
    ${workspaceId}::uuid, ${surveyId}) state`;
}
