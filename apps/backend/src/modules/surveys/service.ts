import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { getRatingBandForValue, type SurveyResultDto } from '@fops/shared';
import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import type { AuditService } from '../core/audit/audit-service.js';
import type { IdempotencyService } from '../core/idempotency/idempotency-service.js';
import type { CheckService } from '../permissions/check-service.js';
import {
  actorSurveyReadScope,
  checkSurveyManage,
  checkSurveyPersonalResponseRead,
  checkSurveyRead,
  isSurveyInReadScope,
} from './authorization.js';
import {
  type QuestionKind,
  type QuestionRow,
  type SurveyRow,
  findSurvey,
  listQuestions,
  listSurveys,
} from './repo-read.js';
import { readSurveyResultAggregates, readSurveyResultResponseCount } from './repo-results.js';
import {
  deleteQuestion,
  insertQuestion,
  insertResponse,
  insertResponseAnswers,
  insertSurvey,
  lockQuestions,
  lockSurvey,
  setSurveyStatus,
  updateQuestion,
  updateQuestionSortOrders,
} from './repo.js';

export interface SurveysActor {
  actor_id: string;
  workspace_id: string;
  role_level: 'admin' | 'developer' | 'user';
}
export interface SurveysServiceDeps {
  db: Db;
  auditService: AuditService;
  checkService: CheckService;
  idempotencyService: IdempotencyService;
}
export type CreateSurveyInput = {
  type: 'discovery' | 'validation' | 'outcome';
  title: string;
  description?: string;
  primary_managed_system_id: string;
  analytics_area_id?: string;
  operator_actor_id?: string;
  responses_identity_protected: boolean;
};
export type QuestionInput = {
  kind: QuestionKind;
  prompt: string;
  is_required?: boolean;
  options?: Array<{ key: string; label: string }>;
  rating_min?: number;
  rating_max?: number;
  rating_low_label?: string;
  rating_high_label?: string;
  sort_order?: number;
  branch_parent_question_id?: string;
  branch_trigger_option_key?: string;
};
export type ResponseSubmissionInput = {
  answers: Array<{ question_id: string; value: string | string[] | number }>;
};
const dto = (s: SurveyRow, questions?: QuestionRow[]) => ({
  id: s.id,
  workspace_id: s.workspace_id,
  display_id: s.display_id,
  type: s.type,
  status: s.status,
  title: s.title,
  description: s.description,
  primary_managed_system_id: s.primary_managed_system_id,
  analytics_area_id: s.analytics_area_id,
  operator_actor_id: s.operator_actor_id,
  responses_identity_protected: s.responses_identity_protected,
  created_by: s.created_by,
  opened_at: s.opened_at?.toISOString() ?? null,
  closed_at: s.closed_at?.toISOString() ?? null,
  created_at: s.created_at.toISOString(),
  updated_at: s.updated_at.toISOString(),
  ...(questions ? { questions: questions.map((q) => questionDto(q)) } : {}),
});
const questionDto = (q: QuestionRow) => ({
  id: q.id,
  survey_id: q.survey_id,
  kind: q.kind,
  prompt: q.prompt,
  is_required: q.is_required,
  options: q.options,
  rating_min: q.rating_min,
  rating_max: q.rating_max,
  rating_low_label: q.rating_low_label,
  rating_high_label: q.rating_high_label,
  sort_order: q.sort_order,
  branch_depth: q.branch_depth,
  branch_parent_question_id: q.branch_parent_question_id,
  branch_trigger_option_key: q.branch_trigger_option_key,
});
const fields = [
  'prompt',
  'is_required',
  'options',
  'rating_min',
  'rating_max',
  'rating_low_label',
  'rating_high_label',
  'sort_order',
  'branch_parent_question_id',
  'branch_trigger_option_key',
  'kind',
] as const;

function validateQuestions(rows: QuestionRow[]) {
  const ids = new Set(rows.map((x) => x.id));
  const order = new Set<number>();
  for (const q of rows) {
    if (order.has(q.sort_order))
      throw new HttpError('validation.failed', 'question sort_order must be unique', {
        fields: [{ path: ['sort_order'], code: 'duplicate' }],
      });
    order.add(q.sort_order);
    const choice = q.kind === 'single_choice' || q.kind === 'multiple_choice';
    if (choice) {
      if (
        !q.options ||
        q.options.length < 2 ||
        q.options.length > 50 ||
        new Set(q.options.map((x) => x.key)).size !== q.options.length ||
        q.options.some((x) => !x.key || !x.label)
      )
        throw new HttpError('validation.failed', 'choice questions require 2-50 unique options', {
          fields: [{ path: ['options'], code: 'invalid' }],
        });
    } else if (q.options !== null)
      throw new HttpError('validation.failed', 'non-choice questions cannot have options', {
        fields: [{ path: ['options'], code: 'invalid' }],
      });
    if (q.kind === 'rating') {
      if (
        q.rating_min === null ||
        q.rating_max === null ||
        q.rating_min >= q.rating_max ||
        q.rating_min < 0 ||
        q.rating_max > 10
      )
        throw new HttpError('validation.failed', 'rating range invalid', {
          fields: [{ path: ['rating_min'], code: 'invalid' }],
        });
    } else if (
      q.rating_min !== null ||
      q.rating_max !== null ||
      q.rating_low_label !== null ||
      q.rating_high_label !== null
    )
      throw new HttpError('validation.failed', 'only rating questions have rating fields', {
        fields: [{ path: ['kind'], code: 'invalid' }],
      });
    if (q.branch_depth === 1) {
      const parent = rows.find((p) => p.id === q.branch_parent_question_id);
      if (
        !parent ||
        !ids.has(parent.id) ||
        parent.kind !== 'single_choice' ||
        parent.branch_depth !== 0 ||
        !parent.options?.some((o) => o.key === q.branch_trigger_option_key)
      )
        throw new HttpError('validation.failed', 'invalid question branch', {
          fields: [{ path: ['branch_parent_question_id'], code: 'invalid' }],
        });
    }
  }
}
async function requireReadable(
  deps: SurveysServiceDeps,
  tx: Tx,
  actor: SurveysActor,
  s: SurveyRow,
) {
  const r = await checkSurveyRead(deps.checkService, actor, s.primary_managed_system_id, { tx });
  if (!r.allow) throw new HttpError('not_found.record', 'survey not found');
}
async function requireManage(deps: SurveysServiceDeps, tx: Tx, actor: SurveysActor, s: SurveyRow) {
  await requireReadable(deps, tx, actor, s);
  const d = await checkSurveyManage(deps.checkService, actor, s.primary_managed_system_id, { tx });
  if (!d.allow) throw new HttpError('permission.denied', 'survey.manage capability required');
}
function draft(s: SurveyRow) {
  if (s.status !== 'draft')
    throw new HttpError('validation.failed', 'survey questions can only be changed in draft', {
      fields: [{ path: ['status'], code: 'not_draft' }],
    });
}
function normalized(input: QuestionInput, existing?: QuestionRow) {
  const kind = input.kind;
  const choice = kind === 'single_choice' || kind === 'multiple_choice';
  const branchParent =
    input.branch_parent_question_id ?? existing?.branch_parent_question_id ?? null;
  return {
    kind,
    prompt: input.prompt,
    isRequired: input.is_required ?? existing?.is_required ?? false,
    options: choice ? (input.options ?? existing?.options ?? null) : null,
    ratingMin: kind === 'rating' ? (input.rating_min ?? existing?.rating_min ?? null) : null,
    ratingMax: kind === 'rating' ? (input.rating_max ?? existing?.rating_max ?? null) : null,
    ratingLowLabel:
      kind === 'rating' ? (input.rating_low_label ?? existing?.rating_low_label ?? null) : null,
    ratingHighLabel:
      kind === 'rating' ? (input.rating_high_label ?? existing?.rating_high_label ?? null) : null,
    sortOrder: input.sort_order ?? existing?.sort_order ?? 0,
    branchDepth: branchParent ? 1 : 0,
    branchParentQuestionId: branchParent,
    branchParentDepth: branchParent ? 0 : null,
    branchTriggerOptionKey: branchParent
      ? (input.branch_trigger_option_key ?? existing?.branch_trigger_option_key ?? null)
      : null,
  };
}

function atPosition<T>(rows: T[], position: number, value: T): T[] {
  if (position < 0 || position > rows.length)
    throw new HttpError('validation.failed', 'question sort_order is out of range', {
      fields: [{ path: ['sort_order'], code: 'out_of_range' }],
    });
  return [...rows.slice(0, position), value, ...rows.slice(position)];
}

function compactQuestionOrder(rows: QuestionRow[]): QuestionRow[] {
  return rows.map((question, sort_order) => ({ ...question, sort_order }));
}

function validation(message: string, path: Array<string | number>) {
  throw new HttpError('validation.failed', message, { fields: [{ path, code: 'invalid' }] });
}

function validateResponseAnswers(input: ResponseSubmissionInput, questions: QuestionRow[]) {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const answers = new Map<string, string | string[] | number>();
  for (const [index, answer] of input.answers.entries()) {
    const question = byId.get(answer.question_id);
    if (!question)
      validation('question does not belong to survey', ['answers', index, 'question_id']);
    if (answers.has(answer.question_id))
      validation('duplicate question answer', ['answers', index, 'question_id']);
    answers.set(answer.question_id, answer.value);
  }
  for (const question of questions) {
    const value = answers.get(question.id);
    const active =
      question.branch_depth === 0 ||
      answers.get(question.branch_parent_question_id ?? '') === question.branch_trigger_option_key;
    if (!active && value !== undefined)
      validation('answer submitted for inactive branch', ['answers']);
    if (active && question.is_required && value === undefined)
      validation('required question is unanswered', ['answers']);
  }
  return [...answers.entries()].map(([questionId, rawValue]) => {
    const question = byId.get(questionId);
    if (!question) throw new Error('question disappeared during validation');
    let value: string | string[] | number = rawValue;
    const optionKeys = new Set(question.options?.map((option) => option.key) ?? []);
    if (question.kind === 'single_choice') {
      if (typeof value !== 'string' || !value || !optionKeys.has(value))
        validation('invalid single choice answer', ['answers']);
    } else if (question.kind === 'multiple_choice') {
      if (
        !Array.isArray(value) ||
        !value.length ||
        new Set(value).size !== value.length ||
        value.some((option) => !option || !optionKeys.has(option))
      )
        validation('invalid multiple choice answer', ['answers']);
    } else if (question.kind === 'rating') {
      if (
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value < (question.rating_min ?? 0) ||
        value > (question.rating_max ?? 0)
      )
        validation('invalid rating answer', ['answers']);
    } else {
      if (typeof value !== 'string') validation('invalid text answer', ['answers']);
      const text = value as string;
      value = text.trim();
      if (!value || [...value].length > 4000) validation('invalid text answer', ['answers']);
    }
    return { questionId, answerKind: question.kind, value };
  });
}

export function createSurveysService(deps: SurveysServiceDeps) {
  async function createSurvey(a: {
    actor: SurveysActor;
    input: CreateSurveyInput;
    idempotencyKey: string;
    requestHash: string;
  }) {
    return deps.db.transaction((tx) =>
      deps.idempotencyService.runIdempotent(
        tx,
        a.actor.actor_id,
        a.idempotencyKey,
        a.requestHash,
        async () => {
          const ms = await tx.execute<{
            id: string;
            archived_at: Date | null;
            default_survey_operator_actor_id: string | null;
          }>(
            sql`select id,archived_at,default_survey_operator_actor_id from core.managed_systems where id=${a.input.primary_managed_system_id} and workspace_id=${a.actor.workspace_id} for update`,
          );
          const m = ms.rows[0];
          if (!m) throw new HttpError('not_found.record', 'managed system not found');
          if (m.archived_at)
            throw new HttpError('conflict.parent_archived', 'managed system archived');
          const manage = await checkSurveyManage(deps.checkService, a.actor, m.id, { tx });
          if (!manage.allow)
            throw new HttpError('permission.denied', 'survey.manage capability required');
          if (a.input.analytics_area_id) {
            const aa = await tx.execute<{ managed_system_id: string; archived_at: Date | null }>(
              sql`select managed_system_id,archived_at from core.analytics_areas where id=${a.input.analytics_area_id} and workspace_id=${a.actor.workspace_id} for update`,
            );
            const r = aa.rows[0];
            if (!r) throw new HttpError('not_found.record', 'analytics area not found');
            if (r.managed_system_id !== m.id || r.archived_at)
              throw new HttpError(
                'validation.failed',
                'analytics area must be active and belong to managed system',
                { fields: [{ path: ['analytics_area_id'], code: 'out_of_scope' }] },
              );
          }
          const operator =
            a.input.operator_actor_id ?? m.default_survey_operator_actor_id ?? a.actor.actor_id;
          const resolution = a.input.operator_actor_id
            ? 'explicit'
            : m.default_survey_operator_actor_id
              ? 'managed_system_default'
              : 'creator';
          const op = await tx.execute<{ id: string; role_level: 'admin' | 'developer' | 'user' }>(
            sql`select id,role_level from core.actors where id=${operator} and workspace_id=${a.actor.workspace_id} for update`,
          );
          if (!op.rows[0])
            throw new HttpError('validation.failed', 'operator must be in workspace', {
              fields: [{ path: ['operator_actor_id'], code: 'invalid' }],
            });
          const opDecision = await checkSurveyManage(
            deps.checkService,
            {
              actor_id: operator,
              workspace_id: a.actor.workspace_id,
              role_level: op.rows[0].role_level,
            },
            m.id,
            { tx },
          );
          if (!opDecision.allow)
            throw new HttpError('validation.failed', 'operator requires survey.manage', {
              fields: [{ path: ['operator_actor_id'], code: 'permission_denied' }],
            });
          const s = await insertSurvey(tx, {
            workspaceId: a.actor.workspace_id,
            type: a.input.type,
            title: a.input.title,
            description: a.input.description ?? null,
            primaryManagedSystemId: m.id,
            analyticsAreaId: a.input.analytics_area_id ?? null,
            operatorActorId: operator,
            responsesIdentityProtected: a.input.responses_identity_protected,
            createdBy: a.actor.actor_id,
          });
          await deps.auditService.record(tx, {
            workspace_id: a.actor.workspace_id,
            actor_id: a.actor.actor_id,
            event_type: 'survey_created',
            subject_type: 'survey',
            subject_id: s.id,
            summary: 'Survey created',
            detail: {
              survey_id: s.id,
              display_id: s.display_id,
              survey_type: s.type,
              primary_managed_system_id: s.primary_managed_system_id,
              analytics_area_id: s.analytics_area_id,
              operator_actor_id: operator,
              operator_resolution: resolution,
              responses_identity_protected: s.responses_identity_protected,
            },
          });
          return { status: 201, body: dto(s) };
        },
      ),
    );
  }
  async function mutateQuestion(
    mode: 'create' | 'update' | 'delete',
    a: {
      actor: SurveysActor;
      surveyId: string;
      questionId?: string;
      input?: QuestionInput;
      idempotencyKey: string;
      requestHash: string;
    },
  ) {
    return deps.db.transaction((tx) =>
      deps.idempotencyService.runIdempotent<unknown>(
        tx,
        a.actor.actor_id,
        a.idempotencyKey,
        a.requestHash,
        async () => {
          const s = await lockSurvey(tx, a.actor.workspace_id, a.surveyId);
          if (!s) throw new HttpError('not_found.record', 'survey not found');
          await requireManage(deps, tx, a.actor, s);
          draft(s);
          const rows = await lockQuestions(tx, a.actor.workspace_id, s.id);
          const old = a.questionId ? rows.find((q) => q.id === a.questionId) : undefined;
          if (a.questionId && !old) throw new HttpError('not_found.record', 'question not found');
          if (mode === 'delete') {
            if (!old) throw new HttpError('not_found.record', 'question not found');
            if (rows.some((q) => q.branch_parent_question_id === old.id))
              throw new HttpError('validation.failed', 'question has branches', {
                fields: [{ path: ['question_id'], code: 'referenced' }],
              });
            const candidate = compactQuestionOrder(rows.filter((q) => q.id !== old.id));
            validateQuestions(candidate);
            await deleteQuestion(tx, a.actor.workspace_id, old.id);
            await updateQuestionSortOrders(
              tx,
              a.actor.workspace_id,
              candidate
                .filter(
                  (question) =>
                    question.sort_order !== rows.find((q) => q.id === question.id)?.sort_order,
                )
                .map((question) => ({ id: question.id, sortOrder: question.sort_order })),
            );
            await deps.auditService.record(tx, {
              workspace_id: a.actor.workspace_id,
              actor_id: a.actor.actor_id,
              event_type: 'survey_question_deleted',
              subject_type: 'survey_question',
              subject_id: old.id,
              summary: 'Survey question deleted',
              detail: {
                survey_id: s.id,
                question_id: old.id,
                kind: old.kind,
                branch_depth: old.branch_depth,
              },
            });
            return { status: 200, body: { deleted: true, id: old.id } };
          }
          if (!a.input) throw new Error('question input missing');
          if (mode === 'update' && !old)
            throw new HttpError('not_found.record', 'question not found');
          const n = normalized(a.input, old);
          const drafted: QuestionRow = {
            id: 'new',
            workspace_id: a.actor.workspace_id,
            survey_id: s.id,
            kind: n.kind,
            prompt: n.prompt,
            is_required: n.isRequired,
            options: n.options,
            rating_min: n.ratingMin,
            rating_max: n.ratingMax,
            rating_low_label: n.ratingLowLabel,
            rating_high_label: n.ratingHighLabel,
            sort_order: n.sortOrder,
            branch_depth: n.branchDepth as 0 | 1,
            branch_parent_question_id: n.branchParentQuestionId,
            branch_parent_depth: n.branchParentDepth as 0 | null,
            branch_trigger_option_key: n.branchTriggerOptionKey,
            created_at: new Date(),
            updated_at: new Date(),
          };
          const position =
            a.input.sort_order ?? (mode === 'create' ? rows.length : (old?.sort_order ?? 0));
          const withoutTarget = mode === 'create' ? rows : rows.filter((q) => q.id !== old?.id);
          const target =
            mode === 'create' ? drafted : { ...old, ...drafted, id: old?.id ?? drafted.id };
          const candidate = compactQuestionOrder(atPosition(withoutTarget, position, target));
          validateQuestions(candidate);
          const orderingChanged = candidate.some(
            (question) =>
              question.sort_order !== rows.find((q) => q.id === question.id)?.sort_order,
          );
          const shifted = candidate
            .filter(
              (question) =>
                question.id !== 'new' &&
                question.sort_order !== rows.find((q) => q.id === question.id)?.sort_order,
            )
            .map((question) => ({ id: question.id, sortOrder: question.sort_order }));
          if (mode === 'create') {
            await updateQuestionSortOrders(tx, a.actor.workspace_id, shifted);
            const q = await insertQuestion(tx, {
              workspaceId: a.actor.workspace_id,
              surveyId: s.id,
              ...n,
              sortOrder: candidate.find((question) => question.id === 'new')?.sort_order ?? 0,
            });
            await deps.auditService.record(tx, {
              workspace_id: a.actor.workspace_id,
              actor_id: a.actor.actor_id,
              event_type: 'survey_question_created',
              subject_type: 'survey_question',
              subject_id: q.id,
              summary: 'Survey question created',
              detail: {
                survey_id: s.id,
                question_id: q.id,
                kind: q.kind,
                branch_depth: q.branch_depth,
                ...(q.branch_parent_question_id
                  ? { branch_parent_question_id: q.branch_parent_question_id }
                  : {}),
                sort_order: q.sort_order,
              },
            });
            return { status: 201, body: questionDto(q) };
          }
          if (!old) throw new HttpError('not_found.record', 'question not found');
          const map: Record<(typeof fields)[number], keyof QuestionRow> = {
            is_required: 'is_required',
            rating_min: 'rating_min',
            rating_max: 'rating_max',
            rating_low_label: 'rating_low_label',
            rating_high_label: 'rating_high_label',
            branch_parent_question_id: 'branch_parent_question_id',
            branch_trigger_option_key: 'branch_trigger_option_key',
            sort_order: 'sort_order',
            prompt: 'prompt',
            options: 'options',
            kind: 'kind',
          };
          const updated = candidate.find((question) => question.id === old.id);
          if (!updated) throw new Error('question lost from candidate');
          const changed = fields.filter(
            (k) => JSON.stringify(old[map[k]]) !== JSON.stringify(updated[map[k]]),
          );
          if (!changed.length && !orderingChanged) return { status: 200, body: questionDto(old) };
          await updateQuestionSortOrders(tx, a.actor.workspace_id, shifted);
          const q = await updateQuestion(tx, a.actor.workspace_id, old.id, {
            ...n,
            sortOrder: updated.sort_order,
          });
          if (!q) throw new Error('question lost');
          await deps.auditService.record(tx, {
            workspace_id: a.actor.workspace_id,
            actor_id: a.actor.actor_id,
            event_type: 'survey_question_updated',
            subject_type: 'survey_question',
            subject_id: q.id,
            summary: 'Survey question updated',
            detail: {
              survey_id: s.id,
              question_id: q.id,
              changed_fields: changed,
              ordering_changed: orderingChanged,
            },
          });
          return { status: 200, body: questionDto(q) };
        },
      ),
    );
  }
  async function transition(a: {
    actor: SurveysActor;
    surveyId: string;
    target: 'open' | 'closed';
    idempotencyKey: string;
    requestHash: string;
  }) {
    return deps.db.transaction((tx) =>
      deps.idempotencyService.runIdempotent(
        tx,
        a.actor.actor_id,
        a.idempotencyKey,
        a.requestHash,
        async () => {
          const s = await lockSurvey(tx, a.actor.workspace_id, a.surveyId);
          if (!s) throw new HttpError('not_found.record', 'survey not found');
          await requireManage(deps, tx, a.actor, s);
          if (a.target === 'open' && s.status === 'open') return { status: 200, body: dto(s) };
          if (
            (a.target === 'open' && s.status !== 'draft') ||
            (a.target === 'closed' && s.status !== 'open')
          )
            throw new HttpError('validation.failed', 'invalid survey transition', {
              fields: [{ path: ['status'], code: 'invalid_transition' }],
            });
          const qs = await lockQuestions(tx, a.actor.workspace_id, s.id);
          if (a.target === 'open') {
            if (!qs.length)
              throw new HttpError('validation.failed', 'survey requires a question', {
                fields: [{ path: ['questions'], code: 'required' }],
              });
            validateQuestions(qs);
          }
          const updated = await setSurveyStatus(tx, a.actor.workspace_id, s.id, a.target);
          await deps.auditService.record(tx, {
            workspace_id: a.actor.workspace_id,
            actor_id: a.actor.actor_id,
            event_type: a.target === 'open' ? 'survey_opened' : 'survey_closed',
            subject_type: 'survey',
            subject_id: s.id,
            summary: a.target === 'open' ? 'Survey opened' : 'Survey closed',
            detail:
              a.target === 'open'
                ? { survey_id: s.id, display_id: s.display_id, question_count: qs.length }
                : { survey_id: s.id, display_id: s.display_id },
          });
          return { status: 200, body: dto(updated) };
        },
      ),
    );
  }
  async function getSurvey(actor: SurveysActor, id: string) {
    const s = await findSurvey(deps.db, actor.workspace_id, id);
    if (!s) throw new HttpError('not_found.record', 'survey not found');
    const r = await checkSurveyRead(deps.checkService, actor, s.primary_managed_system_id);
    if (!r.allow) throw new HttpError('not_found.record', 'survey not found');
    return dto(s, await listQuestions(deps.db, actor.workspace_id, id));
  }
  async function getRespondentForm(actor: SurveysActor, id: string) {
    const survey = await findSurvey(deps.db, actor.workspace_id, id);
    if (!survey) throw new HttpError('not_found.record', 'survey not found');
    if (survey.status !== 'open')
      throw new HttpError('conflict.survey_not_open', 'survey is not open');
    const questions = await listQuestions(deps.db, actor.workspace_id, id);
    return {
      survey: {
        id: survey.id,
        title: survey.title,
        type: survey.type,
        identity_protected: survey.responses_identity_protected,
      },
      questions: questions.map((question) => ({
        id: question.id,
        kind: question.kind,
        prompt: question.prompt,
        is_required: question.is_required,
        sort_order: question.sort_order,
        options: question.options,
        rating_min: question.rating_min,
        rating_max: question.rating_max,
        rating_low_label: question.rating_low_label,
        rating_high_label: question.rating_high_label,
        branch_parent_question_id: question.branch_parent_question_id,
        branch_trigger_option_key: question.branch_trigger_option_key,
      })),
    };
  }
  async function getSurveyResults(actor: SurveysActor, id: string): Promise<SurveyResultDto> {
    const survey = await findSurvey(deps.db, actor.workspace_id, id);
    if (!survey) throw new HttpError('not_found.record', 'survey not found');
    const read = await checkSurveyRead(deps.checkService, actor, survey.primary_managed_system_id);
    if (!read.allow) throw new HttpError('not_found.record', 'survey not found');
    const personal = await checkSurveyPersonalResponseRead(
      deps.checkService,
      actor,
      survey.primary_managed_system_id,
    );
    if (survey.status === 'draft')
      throw new HttpError('conflict.survey_results_unavailable', 'survey results unavailable');
    const [questions, responseCount, aggregateRows] = await Promise.all([
      listQuestions(deps.db, actor.workspace_id, survey.id),
      readSurveyResultResponseCount(deps.db, actor.workspace_id, survey.id),
      readSurveyResultAggregates(deps.db, actor.workspace_id, survey.id),
    ]);
    const rowsByQuestion = new Map<string, typeof aggregateRows>();
    for (const row of aggregateRows) {
      const rows = rowsByQuestion.get(row.question_id) ?? [];
      rows.push(row);
      rowsByQuestion.set(row.question_id, rows);
    }
    const suppressed = (questionId: string) => ({
      question_id: questionId,
      visibility: 'suppressed' as const,
      response_count: null,
      suppression: { code: 'anonymity_threshold' as const },
    });
    const holder = personal.allow;
    return {
      survey_id: survey.id,
      status: survey.status,
      identity_protected: survey.responses_identity_protected,
      questions: questions.map((question) => {
        if (!holder && responseCount < 5) return suppressed(question.id);
        const rows = rowsByQuestion.get(question.id) ?? [];
        const answerCount = rows.find((row) => row.bucket_key === null)?.bucket_count ?? 0;
        if (question.kind === 'text') {
          return answerCount > 0 && answerCount < 5 && !holder
            ? suppressed(question.id)
            : { question_id: question.id, visibility: 'visible' as const, kind: 'text' as const,
                answer_count: answerCount, distribution: null, excerpts: [] as [] };
        }
        if (question.kind === 'rating') {
          const distribution = { low: 0, mid: 0, high: 0 };
          for (const row of rows) {
            if (row.bucket_key === null) continue;
            const value = Number(row.bucket_key);
            if (!Number.isInteger(value) || question.rating_min === null || question.rating_max === null || value < question.rating_min || value > question.rating_max) continue;
            distribution[getRatingBandForValue(question.rating_min, question.rating_max, value)] += row.bucket_count;
          }
          const includedCount = distribution.low + distribution.mid + distribution.high;
          if (!holder && Object.values(distribution).some((count) => count > 0 && count < 5)) return suppressed(question.id);
          return { question_id: question.id, visibility: 'visible' as const, kind: 'rating' as const,
            answer_count: includedCount, distribution };
        }
        const rowCounts = new Map(rows.filter((row) => row.bucket_key !== null).map((row) => [row.bucket_key!, row.bucket_count]));
        const option_buckets = (question.options ?? []).map((option) => ({ key: option.key, label: option.label, count: rowCounts.get(option.key) ?? 0 }));
        if (!holder && option_buckets.some((bucket) => bucket.count > 0 && bucket.count < 5)) return suppressed(question.id);
        return { question_id: question.id, visibility: 'visible' as const, kind: 'choice' as const,
          answer_count: answerCount, option_buckets };
      }),
      next_actions: [],
    };
  }
  async function submitResponse(a: {
    actor: SurveysActor;
    surveyId: string;
    input: ResponseSubmissionInput;
    idempotencyKey: string;
    requestHash: string;
  }) {
    return deps.db.transaction((tx) =>
      deps.idempotencyService.runIdempotent(
        tx,
        a.actor.actor_id,
        a.idempotencyKey,
        a.requestHash,
        async () => {
          const survey = await lockSurvey(tx, a.actor.workspace_id, a.surveyId);
          if (!survey) throw new HttpError('not_found.record', 'survey not found');
          if (survey.status !== 'open')
            throw new HttpError('conflict.survey_not_open', 'survey is not open');
          const answers = validateResponseAnswers(
            a.input,
            await lockQuestions(tx, a.actor.workspace_id, survey.id),
          );
          const id = randomUUID();
          const submittedAt = new Date();
          if (
            !(await insertResponse(tx, {
              id,
              workspaceId: a.actor.workspace_id,
              surveyId: survey.id,
              respondentActorId: a.actor.actor_id,
              identityProtected: survey.responses_identity_protected,
              submittedAt,
            }))
          )
            throw new HttpError(
              'conflict.survey_response_already_submitted',
              'survey response already submitted',
            );
          await insertResponseAnswers(tx, {
            workspaceId: a.actor.workspace_id,
            surveyId: survey.id,
            responseId: id,
            answers,
          });
          const body = {
            id,
            survey_id: survey.id,
            submitted_at: submittedAt.toISOString(),
            identity_protected: survey.responses_identity_protected,
          };
          await deps.auditService.record(tx, {
            workspace_id: a.actor.workspace_id,
            actor_id: a.actor.actor_id,
            event_type: 'survey_response_submitted',
            subject_type: 'survey_response',
            subject_id: id,
            summary: 'Survey response submitted',
            detail: {
              survey_id: survey.id,
              response_id: id,
              question_count: answers.length,
              identity_protected: survey.responses_identity_protected,
            },
          });
          return { status: 201, body };
        },
      ),
    );
  }
  async function listSurvey(actor: SurveysActor, managedSystemId?: string) {
    const scope = await actorSurveyReadScope(deps.db, deps.checkService, actor);
    return (await listSurveys(deps.db, actor.workspace_id, managedSystemId))
      .filter((s) => isSurveyInReadScope(scope, s.primary_managed_system_id))
      .map((s) => dto(s));
  }
  return {
    createSurvey,
    createQuestion: (a: Parameters<typeof mutateQuestion>[1]) => mutateQuestion('create', a),
    updateQuestion: (a: Parameters<typeof mutateQuestion>[1]) => mutateQuestion('update', a),
    deleteQuestion: (a: Parameters<typeof mutateQuestion>[1]) => mutateQuestion('delete', a),
    openSurvey: (a: Parameters<typeof transition>[0]) => transition({ ...a, target: 'open' }),
    closeSurvey: (a: Parameters<typeof transition>[0]) => transition({ ...a, target: 'closed' }),
    getSurvey,
    getRespondentForm,
    getSurveyResults,
    listSurvey,
    submitResponse,
  };
}
export type SurveysService = ReturnType<typeof createSurveysService>;
