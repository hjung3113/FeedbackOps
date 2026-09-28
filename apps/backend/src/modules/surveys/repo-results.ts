import { sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';

export type SurveyResultAggregateRow = {
  question_id: string;
  question_kind: 'single_choice' | 'multiple_choice' | 'rating' | 'text';
  bucket_key: string | null;
  bucket_count: number;
};

/** The fops_app role may use only these aggregate-only SECURITY DEFINER functions. */
export async function readSurveyResultAggregates(
  db: Db,
  workspaceId: string,
  surveyId: string,
): Promise<SurveyResultAggregateRow[]> {
  const result = await db.execute<{
    question_id: string;
    question_kind: SurveyResultAggregateRow['question_kind'];
    bucket_key: string | null;
    bucket_count: number | string;
  }>(
    sql`select question_id, question_kind, bucket_key, bucket_count from survey.read_result_aggregates(${workspaceId}, ${surveyId})`,
  );
  return result.rows.map((row) => ({
    ...row,
    bucket_count: Number(row.bucket_count),
  }));
}

export async function readSurveyResultResponseCount(
  db: Db,
  workspaceId: string,
  surveyId: string,
): Promise<number> {
  const result = await db.execute<{ response_count: number | string }>(
    sql`select survey.read_result_response_count(${workspaceId}, ${surveyId}) as response_count`,
  );
  return Number(result.rows[0]?.response_count ?? 0);
}

export type OutcomeFollowUpStateRow = {
  survey_id: string;
  survey_status: 'draft' | 'open' | 'closed';
  is_outcome: boolean;
  meets_threshold: boolean;
  is_poor: boolean;
  resolution: 'open' | 'finding' | 'no_follow_up';
};

/**
 * Per-response follow-up classification through the ADR-0055 definer. Unlike
 * the aggregate readers above, this one is response-scoped: the surveys
 * module may call it only after the caller crossed the personal-response
 * authorization seam. It never returns answer values or respondent ids.
 */
export async function readOutcomeFollowUpState(
  db: Db,
  workspaceId: string,
  responseId: string,
): Promise<OutcomeFollowUpStateRow | null> {
  const result = await db.execute<OutcomeFollowUpStateRow>(
    sql`select survey_id, survey_status, is_outcome, meets_threshold, is_poor, resolution from survey.read_outcome_follow_up_state(${workspaceId}, ${responseId})`,
  );
  return result.rows[0] ?? null;
}

export type OutcomeFollowUpSurveyStateRow = {
  classifiable: boolean;
  follow_up_needed: boolean;
};

/**
 * Survey-grain follow-up flags through the ADR-0055 definer (0053).
 * Aggregate-only like the readers above: no response ids and no counts, so
 * any survey.read caller may receive them without a personal-read grant.
 */
export async function readOutcomeFollowUpSurveyState(
  db: Db,
  workspaceId: string,
  surveyId: string,
): Promise<OutcomeFollowUpSurveyStateRow | null> {
  const result = await db.execute<OutcomeFollowUpSurveyStateRow>(
    sql`select classifiable, follow_up_needed from survey.read_outcome_follow_up_survey_state(${workspaceId}, ${surveyId})`,
  );
  return result.rows[0] ?? null;
}

export type OutcomeFollowUpItemRow = {
  response_id: string;
  response_number: number;
  submitted_at: Date | string;
  question_id: string;
  question_label: string;
  answer_value: number;
  rating_min: number;
  rating_max: number;
  resolution: 'open' | 'finding' | 'no_follow_up';
  finding_id: string | null;
  finding_display_id: string | null;
  finding_status: 'draft' | 'active' | 'converted' | null;
  finding_managed_system_id: string | null;
  decision_state: 'no_follow_up' | 'reopened' | null;
  decision_reason: string | null;
  decision_updated_at: Date | string | null;
};

/**
 * Per-poor-response review rows through the ADR-0055 definer (0053): one
 * flat row per (poor response, low-band answer), ordered by the 1-based
 * submission ordinal. Personal data, response-scoped like
 * read_outcome_follow_up_state: the surveys module may call it only after
 * the caller crossed the personal-response authorization seam. It never
 * returns text answers, excerpts, or respondent identity.
 */
export async function readOutcomeFollowUpItemsPersonal(
  db: Db,
  workspaceId: string,
  surveyId: string,
): Promise<OutcomeFollowUpItemRow[]> {
  const result = await db.execute<OutcomeFollowUpItemRow>(
    sql`select response_id, response_number, submitted_at, question_id, question_label, answer_value, rating_min, rating_max, resolution, finding_id, finding_display_id, finding_status, finding_managed_system_id, decision_state, decision_reason, decision_updated_at
        from survey.read_outcome_follow_up_items_personal(${workspaceId}, ${surveyId})`,
  );
  return result.rows;
}
