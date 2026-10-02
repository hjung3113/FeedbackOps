import type { SurveyQuestionKind, SurveyType } from '@fops/shared';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import { normalizePgTimestampToIso } from '../../lib/pg-timestamp.js';

const surveyResponseHistoryCursorSchema = z
  .object({
    submittedAt: z.string().datetime({ offset: true }),
    surveyId: z.string().uuid(),
  })
  .strict();

export type SurveyResponseHistoryCursor = z.infer<typeof surveyResponseHistoryCursorSchema>;

export function decodeSurveyResponseHistoryCursor(raw: string): SurveyResponseHistoryCursor {
  const fail = () =>
    new HttpError('validation.failed', 'invalid cursor', {
      fields: [{ path: ['cursor'], code: 'invalid_cursor' }],
    });
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) throw fail();

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch {
    throw fail();
  }
  const result = surveyResponseHistoryCursorSchema.safeParse(parsed);
  if (!result.success) throw fail();
  return result.data;
}

const answerableSurveysCursorSchema = z
  .object({
    openedAt: z.string().datetime({ offset: true }),
    surveyId: z.string().uuid(),
  })
  .strict();

export type AnswerableSurveysCursor = z.infer<typeof answerableSurveysCursorSchema>;

export function decodeAnswerableSurveysCursor(raw: string): AnswerableSurveysCursor {
  const fail = () =>
    new HttpError('validation.failed', 'invalid cursor', {
      fields: [{ path: ['cursor'], code: 'invalid_cursor' }],
    });
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) throw fail();

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch {
    throw fail();
  }
  const result = answerableSurveysCursorSchema.safeParse(parsed);
  if (!result.success) throw fail();
  return result.data;
}

export type SurveyStatus = 'draft' | 'open' | 'closed';
export type QuestionKind = SurveyQuestionKind;
export interface SurveyRow {
  id: string;
  workspace_id: string;
  display_id: string;
  type: SurveyType;
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

export async function listMySurveyResponseHistory(
  db: Db | Tx,
  args: {
    workspace_id: string;
    actor_id: string;
    limit: number;
    cursor?: SurveyResponseHistoryCursor;
  },
) {
  const result = await db.execute<Record<string, unknown>>(sql`
    select survey_id, survey_title, submitted_at::text as submitted_at_raw,
           identity_protected
      from survey.read_my_survey_response_history(
        ${args.workspace_id}::uuid,
        ${args.actor_id}::uuid,
        ${args.limit + 1},
        ${args.cursor?.submittedAt ?? null}::timestamptz,
        ${args.cursor?.surveyId ?? null}::uuid
      )
  `);
  const rows = result.rows.map((row) => ({
    survey_id: row.survey_id as string,
    survey_title: row.survey_title as string,
    submitted_at_raw: row.submitted_at_raw as string,
    identity_protected: row.identity_protected as boolean,
  }));
  const has_more = rows.length > args.limit;
  const pageRows = rows.slice(0, args.limit);
  const items = pageRows.map((row) => ({
    survey_id: row.survey_id,
    survey_title: row.survey_title,
    submitted_at: normalizePgTimestampToIso(row.submitted_at_raw),
    identity_protected: row.identity_protected,
  }));
  const last = pageRows.at(-1);
  const cursor =
    has_more && last
      ? Buffer.from(
          JSON.stringify({
            submittedAt: normalizePgTimestampToIso(last.submitted_at_raw),
            surveyId: last.survey_id,
          }),
          'utf8',
        ).toString('base64')
      : undefined;

  return {
    items,
    page: {
      has_more,
      ...(cursor === undefined ? {} : { cursor }),
    },
  };
}

export async function listMyAnswerableSurveys(
  db: Db | Tx,
  args: {
    workspace_id: string;
    actor_id: string;
    limit: number;
    cursor?: AnswerableSurveysCursor;
  },
) {
  const result = await db.execute<Record<string, unknown>>(sql`
    select survey_id, display_id, title, type, question_count, opened_at::text as opened_at_raw
      from survey.read_my_answerable_surveys(
        ${args.workspace_id}::uuid,
        ${args.actor_id}::uuid,
        ${args.limit + 1},
        ${args.cursor?.openedAt ?? null}::timestamptz,
        ${args.cursor?.surveyId ?? null}::uuid
      )
  `);
  const rows = result.rows.map((row) => ({
    survey_id: row.survey_id as string,
    display_id: row.display_id as string,
    title: row.title as string,
    type: row.type as SurveyType,
    question_count: Number(row.question_count),
    opened_at_raw: row.opened_at_raw as string,
  }));
  const has_more = rows.length > args.limit;
  const pageRows = rows.slice(0, args.limit);
  const items = pageRows.map((row) => ({
    survey_id: row.survey_id,
    display_id: row.display_id,
    title: row.title,
    type: row.type,
    question_count: row.question_count,
    opened_at: normalizePgTimestampToIso(row.opened_at_raw),
  }));
  const last = pageRows.at(-1);
  const cursor =
    has_more && last
      ? Buffer.from(
          JSON.stringify({
            openedAt: normalizePgTimestampToIso(last.opened_at_raw),
            surveyId: last.survey_id,
          }),
          'utf8',
        ).toString('base64')
      : undefined;

  return {
    items,
    page: {
      has_more,
      ...(cursor === undefined ? {} : { cursor }),
    },
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
export async function listSurveyManagedSystemIds(db: Db | Tx, workspaceId: string) {
  const x = await db.execute<{ primary_managed_system_id: string }>(
    sql`select distinct primary_managed_system_id from survey.surveys where workspace_id=${workspaceId}`,
  );
  return x.rows.map((row) => row.primary_managed_system_id);
}
export async function listQuestions(db: Db | Tx, workspaceId: string, surveyId: string) {
  const x = await db.execute<Record<string, unknown>>(
    sql`select id,workspace_id,survey_id,kind,prompt,is_required,options,rating_min,rating_max,rating_low_label,rating_high_label,sort_order,branch_depth,branch_parent_question_id,branch_parent_depth,branch_trigger_option_key,created_at,updated_at from survey.survey_questions where workspace_id=${workspaceId} and survey_id=${surveyId} order by sort_order,id`,
  );
  return x.rows.map(mapQuestion);
}
