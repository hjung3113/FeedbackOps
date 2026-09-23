import { type SurveyResultDto, getRatingBandForValue, surveyResultDtoSchema } from '@fops/shared';
import { HttpError } from '../../lib/errors.js';
import {
  actorFindingReadScope,
  checkFindingManage,
  isFindingInReadScope,
} from '../findings/authorization.js';
import { checkSurveyPersonalResponseRead, checkSurveyRead } from './authorization.js';
import {
  listDerivedFindingsForResponses,
  readApprovedResultExcerptsPersonal,
} from './repo-evidence.js';
import { findSurvey, listQuestions } from './repo-read.js';
import { readSurveyResultAggregates, readSurveyResultResponseCount } from './repo-results.js';
import type { SurveysActor, SurveysServiceDeps } from './service.js';

type ResultExcerptRow = {
  approved_excerpt_id: string;
  question_id: string;
  redacted_excerpt: string;
  response_id?: string;
};

export function createSurveyResults(deps: SurveysServiceDeps) {
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
    const holder = personal.allow;
    return deps.db.transaction(async (tx) => {
      const workspaceSettings = await deps.resolveWorkspaceSettings(tx, actor.workspace_id);
      const anonymityThreshold = workspaceSettings.survey_anonymity_threshold;
      // Response IDs stay payload-gated below; this internal projection only
      // supplies the IDs needed to resolve already-derived Finding links.
      const excerptRows: Promise<ResultExcerptRow[]> = readApprovedResultExcerptsPersonal(
        tx,
        actor.workspace_id,
        survey.id,
      );
      const [questions, responseCount, aggregateRows, approvedExcerpts, findingManage] =
        await Promise.all([
          listQuestions(tx, actor.workspace_id, survey.id),
          readSurveyResultResponseCount(tx, actor.workspace_id, survey.id),
          readSurveyResultAggregates(tx, actor.workspace_id, survey.id),
          excerptRows,
          checkFindingManage(deps.checkService, actor, survey.primary_managed_system_id, {
            requireElevatedRole: false,
          }),
        ]);
      const derivedFindings = await listDerivedFindingsForResponses(
        tx,
        actor.workspace_id,
        approvedExcerpts.flatMap((excerpt) => (excerpt.response_id ? [excerpt.response_id] : [])),
      );
      const findingReadScope = await actorFindingReadScope(tx, actor, {
        requireElevatedRole: true,
      });
      // blocked_requestable is elevated + readable + not manageable; a user
      // cannot receive this action because Finding read scope is elevated-only.
      const requestTaskActions = await Promise.all(
        derivedFindings
          .filter((finding) =>
            isFindingInReadScope(findingReadScope, finding.primary_managed_system_id),
          )
          .map(async (finding) => {
            const decision = await checkFindingManage(
              deps.checkService,
              actor,
              finding.primary_managed_system_id,
              { requireElevatedRole: true },
            );
            return {
              id: 'request_task' as const,
              availability: decision.allow
                ? ('allowed' as const)
                : ('blocked_requestable' as const),
              intent: 'open_task_request_draft' as const,
              source_finding_id: finding.finding_id,
              ...(!decision.allow && decision.requestable !== null
                ? {
                    requestable_permission: {
                      permission: 'finding.manage' as const,
                      managed_system_id: finding.primary_managed_system_id,
                    },
                  }
                : {}),
            };
          }),
      );
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
      const excerptsByQuestion = new Map<
        string,
        Array<{ id: string; text: string; response_id?: string }>
      >();
      for (const excerpt of approvedExcerpts) {
        const excerpts = excerptsByQuestion.get(excerpt.question_id) ?? [];
        const rid = holder ? excerpt.response_id : undefined;
        excerpts.push({
          id: excerpt.approved_excerpt_id,
          text: excerpt.redacted_excerpt,
          ...(rid ? { response_id: rid } : {}),
        });
        excerptsByQuestion.set(excerpt.question_id, excerpts);
      }
      const requestablePermission = {
        permission: 'finding.manage' as const,
        managed_system_id: survey.primary_managed_system_id,
      };
      const availability = findingManage.allow ? 'allowed' : 'blocked_requestable';
      const actionPermission =
        !findingManage.allow && findingManage.requestable !== null
          ? { requestable_permission: requestablePermission }
          : {};
      const result = surveyResultDtoSchema.parse({
        survey_id: survey.id,
        status: survey.status,
        identity_protected: survey.responses_identity_protected,
        questions: questions.map((question) => {
          if (!holder && responseCount < anonymityThreshold) return suppressed(question.id);
          const rows = rowsByQuestion.get(question.id) ?? [];
          const answerCount = rows.find((row) => row.bucket_key === null)?.bucket_count ?? 0;
          if (question.kind === 'text') {
            return answerCount > 0 && answerCount < anonymityThreshold && !holder
              ? suppressed(question.id)
              : {
                  question_id: question.id,
                  visibility: 'visible' as const,
                  kind: 'text' as const,
                  answer_count: answerCount,
                  distribution: null,
                  excerpts: excerptsByQuestion.get(question.id) ?? [],
                };
          }
          if (question.kind === 'rating') {
            const distribution = { low: 0, mid: 0, high: 0 };
            for (const row of rows) {
              if (row.bucket_key === null) continue;
              const value = Number(row.bucket_key);
              if (
                !Number.isInteger(value) ||
                question.rating_min === null ||
                question.rating_max === null ||
                value < question.rating_min ||
                value > question.rating_max
              )
                continue;
              distribution[
                getRatingBandForValue(question.rating_min, question.rating_max, value)
              ] += row.bucket_count;
            }
            if (
              !holder &&
              Object.values(distribution).some((count) => count > 0 && count < anonymityThreshold)
            )
              return suppressed(question.id);
            return {
              question_id: question.id,
              visibility: 'visible' as const,
              kind: 'rating' as const,
              answer_count: answerCount,
              distribution,
            };
          }
          const rowCounts = new Map<string, number>();
          for (const row of rows) {
            if (row.bucket_key !== null) rowCounts.set(row.bucket_key, row.bucket_count);
          }
          const option_buckets = (question.options ?? []).map((option) => ({
            key: option.key,
            label: option.label,
            count: rowCounts.get(option.key) ?? 0,
          }));
          if (
            !holder &&
            option_buckets.some((bucket) => bucket.count > 0 && bucket.count < anonymityThreshold)
          )
            return suppressed(question.id);
          return {
            question_id: question.id,
            visibility: 'visible' as const,
            kind: 'choice' as const,
            answer_count: answerCount,
            option_buckets,
          };
        }),
        next_actions: [
          {
            id: 'create_finding' as const,
            availability,
            intent: 'open_finding_draft' as const,
            ...actionPermission,
          },
          ...requestTaskActions,
        ],
      });
      if (holder) {
        const exposed = new Map<string, { responseId: string; questionId: string }>();
        for (const question of result.questions)
          if ('excerpts' in question)
            for (const excerpt of question.excerpts) {
              const rid = excerpt.response_id;
              if (rid)
                exposed.set(`${rid}:${question.question_id}`, {
                  responseId: rid,
                  questionId: question.question_id,
                });
            }
        for (const { responseId, questionId } of exposed.values())
          await deps.auditService.record(tx, {
            workspace_id: actor.workspace_id,
            actor_id: actor.actor_id,
            event_type: 'survey_response_personal_read',
            subject_type: 'survey_response',
            subject_id: responseId,
            summary: 'Survey response personal result read',
            detail: {
              survey_id: survey.id,
              survey_response_id: responseId,
              question_id: questionId,
            },
          });
      }
      return result;
    });
  }
  return { getSurveyResults };
}
