import { sql } from 'drizzle-orm';
import type { Tx } from '../../db/tx.js';
import type { QuestionKind } from './repo-read.js';
import { type QuestionRow, type SurveyRow, mapQuestion, mapSurvey } from './repo-read.js';

const surveyCols = sql`id, workspace_id, display_id, type, status, title, description, primary_managed_system_id, analytics_area_id, operator_actor_id, responses_identity_protected, created_by, opened_at, closed_at, created_at, updated_at`;
export async function lockSurvey(
  tx: Tx,
  workspaceId: string,
  id: string,
): Promise<SurveyRow | null> {
  const x = await tx.execute<Record<string, unknown>>(
    sql`select ${surveyCols} from survey.surveys where workspace_id=${workspaceId} and id=${id} for update`,
  );
  return x.rows[0] ? mapSurvey(x.rows[0]) : null;
}
export async function lockQuestions(
  tx: Tx,
  workspaceId: string,
  surveyId: string,
): Promise<QuestionRow[]> {
  const x = await tx.execute<Record<string, unknown>>(
    sql`select id,workspace_id,survey_id,kind,prompt,is_required,options,rating_min,rating_max,rating_low_label,rating_high_label,sort_order,branch_depth,branch_parent_question_id,branch_parent_depth,branch_trigger_option_key,created_at,updated_at from survey.survey_questions where workspace_id=${workspaceId} and survey_id=${surveyId} order by sort_order,id for update`,
  );
  return x.rows.map(mapQuestion);
}
export async function insertSurvey(tx: Tx, input: Record<string, unknown>): Promise<SurveyRow> {
  const d = await tx.execute<{ v: string }>(
    sql`select core.next_display_id(${input.workspaceId as string}, 'survey') v`,
  );
  const display = d.rows[0]?.v;
  if (!display) throw new Error('next_display_id returned empty');
  const x = await tx.execute<Record<string, unknown>>(
    sql`insert into survey.surveys (workspace_id,display_id,type,title,description,primary_managed_system_id,analytics_area_id,operator_actor_id,responses_identity_protected,created_by) values (${input.workspaceId as string},${display},${input.type as string},${input.title as string},${input.description as string | null},${input.primaryManagedSystemId as string},${input.analyticsAreaId as string | null},${input.operatorActorId as string},${input.responsesIdentityProtected as boolean},${input.createdBy as string}) returning ${surveyCols}`,
  );
  if (!x.rows[0]) throw new Error('insert survey failed');
  return mapSurvey(x.rows[0]);
}
export async function insertQuestion(tx: Tx, input: Record<string, unknown>): Promise<QuestionRow> {
  const options = input.options == null ? null : JSON.stringify(input.options);
  const x = await tx.execute<Record<string, unknown>>(
    sql`insert into survey.survey_questions (workspace_id,survey_id,kind,prompt,is_required,options,rating_min,rating_max,rating_low_label,rating_high_label,sort_order,branch_depth,branch_parent_question_id,branch_parent_depth,branch_trigger_option_key) values (${input.workspaceId as string},${input.surveyId as string},${input.kind as string},${input.prompt as string},${input.isRequired as boolean},${options}::jsonb,${input.ratingMin as number | null},${input.ratingMax as number | null},${input.ratingLowLabel as string | null},${input.ratingHighLabel as string | null},${input.sortOrder as number},${input.branchDepth as number},${input.branchParentQuestionId as string | null},${input.branchParentDepth as number | null},${input.branchTriggerOptionKey as string | null}) returning id,workspace_id,survey_id,kind,prompt,is_required,options,rating_min,rating_max,rating_low_label,rating_high_label,sort_order,branch_depth,branch_parent_question_id,branch_parent_depth,branch_trigger_option_key,created_at,updated_at`,
  );
  if (!x.rows[0]) throw new Error('insert question failed');
  return mapQuestion(x.rows[0]);
}
export async function updateQuestion(
  tx: Tx,
  workspaceId: string,
  id: string,
  input: Record<string, unknown>,
): Promise<QuestionRow | null> {
  const options = input.options == null ? null : JSON.stringify(input.options);
  const x = await tx.execute<Record<string, unknown>>(
    sql`update survey.survey_questions set kind=${input.kind as string},prompt=${input.prompt as string},is_required=${input.isRequired as boolean},options=${options}::jsonb,rating_min=${input.ratingMin as number | null},rating_max=${input.ratingMax as number | null},rating_low_label=${input.ratingLowLabel as string | null},rating_high_label=${input.ratingHighLabel as string | null},sort_order=${input.sortOrder as number},branch_depth=${input.branchDepth as number},branch_parent_question_id=${input.branchParentQuestionId as string | null},branch_parent_depth=${input.branchParentDepth as number | null},branch_trigger_option_key=${input.branchTriggerOptionKey as string | null},updated_at=now() where workspace_id=${workspaceId} and id=${id} returning id,workspace_id,survey_id,kind,prompt,is_required,options,rating_min,rating_max,rating_low_label,rating_high_label,sort_order,branch_depth,branch_parent_question_id,branch_parent_depth,branch_trigger_option_key,created_at,updated_at`,
  );
  return x.rows[0] ? mapQuestion(x.rows[0]) : null;
}
export async function updateQuestionSortOrders(
  tx: Tx,
  workspaceId: string,
  questions: Array<{ id: string; sortOrder: number }>,
) {
  for (const question of questions) {
    await tx.execute(
      sql`update survey.survey_questions set sort_order=${question.sortOrder},updated_at=now() where workspace_id=${workspaceId} and id=${question.id}`,
    );
  }
}
export async function deleteQuestion(tx: Tx, workspaceId: string, id: string) {
  await tx.execute(
    sql`delete from survey.survey_questions where workspace_id=${workspaceId} and id=${id}`,
  );
}
export async function setSurveyStatus(
  tx: Tx,
  workspaceId: string,
  id: string,
  status: 'open' | 'closed',
): Promise<SurveyRow> {
  const time = status === 'open' ? sql`opened_at=now()` : sql`closed_at=now()`;
  const x = await tx.execute<Record<string, unknown>>(
    sql`update survey.surveys set status=${status},${time},updated_at=now() where workspace_id=${workspaceId} and id=${id} returning ${surveyCols}`,
  );
  if (!x.rows[0]) throw new Error('survey status update failed');
  return mapSurvey(x.rows[0]);
}

export async function insertResponse(
  tx: Tx,
  input: {
    id: string;
    workspaceId: string;
    surveyId: string;
    respondentActorId: string;
    identityProtected: boolean;
    submittedAt: Date;
  },
): Promise<boolean> {
  const result = await tx.execute(
    sql`insert into survey.survey_responses (id,workspace_id,survey_id,respondent_actor_id,identity_protected,submitted_at) values (${input.id},${input.workspaceId},${input.surveyId},${input.respondentActorId},${input.identityProtected},${input.submittedAt}) on conflict do nothing`,
  );
  return result.rowCount === 1;
}

export async function insertResponseAnswers(
  tx: Tx,
  input: {
    workspaceId: string;
    surveyId: string;
    responseId: string;
    answers: Array<{
      questionId: string;
      answerKind: QuestionKind;
      value: string | string[] | number;
    }>;
  },
) {
  if (!input.answers.length) return;
  const values = sql.join(
    input.answers.map(
      (answer) =>
        sql`(${input.workspaceId},${input.surveyId},${input.responseId},${answer.questionId},${answer.answerKind},${JSON.stringify(answer.value)}::jsonb)`,
    ),
    sql`,`,
  );
  await tx.execute(
    sql`insert into survey.survey_response_answers (workspace_id,survey_id,response_id,question_id,answer_kind,answer_value) values ${values}`,
  );
}
