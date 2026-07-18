import { sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';

export type SurveyStatus = 'draft' | 'open' | 'closed';
export type QuestionKind = 'single_choice' | 'multiple_choice' | 'rating' | 'text';
export interface SurveyRow {
  id: string;
  workspace_id: string;
  display_id: string;
  type: 'discovery' | 'validation' | 'outcome';
  status: SurveyStatus;
  title: string;
  description: string | null;
  primary_managed_system_id: string;
  analytics_area_id: string | null;
  operator_actor_id: string;
  responses_identity_protected: boolean;
  created_by: string;
  opened_at: Date | null;
  closed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}
export interface QuestionRow {
  id: string;
  workspace_id: string;
  survey_id: string;
  kind: QuestionKind;
  prompt: string;
  is_required: boolean;
  options: Array<{ key: string; label: string }> | null;
  rating_min: number | null;
  rating_max: number | null;
  rating_low_label: string | null;
  rating_high_label: string | null;
  sort_order: number;
  branch_depth: 0 | 1;
  branch_parent_question_id: string | null;
  branch_parent_depth: 0 | 1 | null;
  branch_trigger_option_key: string | null;
  created_at: Date;
  updated_at: Date;
}
const date = (v: unknown) => (v instanceof Date ? v : new Date(v as string));
export function mapSurvey(r: Record<string, unknown>): SurveyRow {
  return {
    id: r.id as string,
    workspace_id: r.workspace_id as string,
    display_id: r.display_id as string,
    type: r.type as SurveyRow['type'],
    status: r.status as SurveyStatus,
    title: r.title as string,
    description: r.description as string | null,
    primary_managed_system_id: r.primary_managed_system_id as string,
    analytics_area_id: r.analytics_area_id as string | null,
    operator_actor_id: r.operator_actor_id as string,
    responses_identity_protected: r.responses_identity_protected as boolean,
    created_by: r.created_by as string,
    opened_at: r.opened_at ? date(r.opened_at) : null,
    closed_at: r.closed_at ? date(r.closed_at) : null,
    created_at: date(r.created_at),
    updated_at: date(r.updated_at),
  };
}
export function mapQuestion(r: Record<string, unknown>): QuestionRow {
  return {
    id: r.id as string,
    workspace_id: r.workspace_id as string,
    survey_id: r.survey_id as string,
    kind: r.kind as QuestionKind,
    prompt: r.prompt as string,
    is_required: r.is_required as boolean,
    options: r.options as QuestionRow['options'],
    rating_min: r.rating_min === null ? null : Number(r.rating_min),
    rating_max: r.rating_max === null ? null : Number(r.rating_max),
    rating_low_label: r.rating_low_label as string | null,
    rating_high_label: r.rating_high_label as string | null,
    sort_order: Number(r.sort_order),
    branch_depth: Number(r.branch_depth) as 0 | 1,
    branch_parent_question_id: r.branch_parent_question_id as string | null,
    branch_parent_depth:
      r.branch_parent_depth === null ? null : (Number(r.branch_parent_depth) as 0 | 1 | null),
    branch_trigger_option_key: r.branch_trigger_option_key as string | null,
    created_at: date(r.created_at),
    updated_at: date(r.updated_at),
  };
}
const surveyCols = sql`id, workspace_id, display_id, type, status, title, description, primary_managed_system_id, analytics_area_id, operator_actor_id, responses_identity_protected, created_by, opened_at, closed_at, created_at, updated_at`;
export async function findSurvey(db: Db | Tx, workspaceId: string, id: string) {
  const x = await db.execute<Record<string, unknown>>(
    sql`select ${surveyCols} from survey.surveys where workspace_id=${workspaceId} and id=${id} limit 1`,
  );
  return x.rows[0] ? mapSurvey(x.rows[0]) : null;
}
export async function listSurveys(db: Db | Tx, workspaceId: string, managedSystemId?: string) {
  const p = managedSystemId ? sql`and primary_managed_system_id=${managedSystemId}` : sql``;
  const x = await db.execute<Record<string, unknown>>(
    sql`select ${surveyCols} from survey.surveys where workspace_id=${workspaceId} ${p} order by created_at desc,id desc`,
  );
  return x.rows.map(mapSurvey);
}
export async function listQuestions(db: Db | Tx, workspaceId: string, surveyId: string) {
  const x = await db.execute<Record<string, unknown>>(
    sql`select id,workspace_id,survey_id,kind,prompt,is_required,options,rating_min,rating_max,rating_low_label,rating_high_label,sort_order,branch_depth,branch_parent_question_id,branch_parent_depth,branch_trigger_option_key,created_at,updated_at from survey.survey_questions where workspace_id=${workspaceId} and survey_id=${surveyId} order by sort_order,id`,
  );
  return x.rows.map(mapQuestion);
}
