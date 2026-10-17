import {
  type SurveyEvidenceCandidatesQuery,
  type SurveyEvidenceCandidatesResponse,
  surveyEvidenceCandidatesResponseSchema,
} from '@fops/shared';
import { z } from 'zod';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import type { CheckService } from '../permissions/check-service.js';
import { checkSurveyPersonalResponseRead, checkSurveyRead } from './authorization.js';
import { readEvidenceCandidatePage } from './repo-evidence.js';
import { findSurvey } from './repo-read.js';
import { readSurveyResultAggregates, readSurveyResultResponseCount } from './repo-results.js';
import type { SurveysActor, SurveysServiceDeps } from './service.js';

const cursorSchema = z
  .object({
    workspace_id: z.string().uuid(),
    actor_id: z.string().uuid(),
    survey_id: z.string().uuid(),
    after: z.string().uuid(),
  })
  .strict();

function decodeCursor(
  raw: string | undefined,
  actor: SurveysActor,
  surveyId: string,
): string | null {
  if (raw === undefined) return null;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error('invalid encoding');
    const cursor = cursorSchema.parse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')));
    if (
      cursor.workspace_id !== actor.workspace_id ||
      cursor.actor_id !== actor.actor_id ||
      cursor.survey_id.toLowerCase() !== surveyId.toLowerCase()
    )
      throw new Error('wrong context');
    return cursor.after;
  } catch {
    throw new HttpError('validation.failed', 'invalid cursor', {
      fields: [{ path: ['cursor'], code: 'invalid_cursor' }],
    });
  }
}

/** Result audience, shared by preview and submit; never calls audited Results. */
export async function resolveExcerptResultAudience(
  tx: Tx,
  checkService: CheckService,
  actor: SurveysActor,
  surveyId: string,
  sourceSystemId: string,
  threshold: number,
): Promise<{
  response_state: SurveyEvidenceCandidatesResponse['response_state'];
  questionIds: string[];
}> {
  const personal = await checkSurveyPersonalResponseRead(checkService, actor, sourceSystemId, {
    tx,
  });
  const count = await readSurveyResultResponseCount(tx, actor.workspace_id, surveyId);
  const response_state =
    count === 0 ? 'none' : count < threshold && !personal.allow ? 'below_threshold' : 'visible';
  if (response_state !== 'visible') return { response_state, questionIds: [] };
  const rows = await readSurveyResultAggregates(tx, actor.workspace_id, surveyId);
  // Approvals belong to text questions only. A low rating/choice bucket cannot
  // suppress an unrelated text question; use actual text-answer totals.
  const questionIds = rows
    .filter(
      (row) =>
        row.question_kind === 'text' &&
        row.bucket_key === null &&
        (personal.allow || row.bucket_count === 0 || row.bucket_count >= threshold),
    )
    .map((row) => row.question_id);
  return { response_state, questionIds };
}

export function createSurveyEvidenceCandidates(deps: SurveysServiceDeps) {
  async function getEvidenceCandidates(
    actor: SurveysActor,
    surveyId: string,
    query: SurveyEvidenceCandidatesQuery,
  ): Promise<SurveyEvidenceCandidatesResponse> {
    const after = decodeCursor(query.cursor, actor, surveyId);
    return deps.db.transaction(
      async (tx) => {
        const survey = await findSurvey(tx, actor.workspace_id, surveyId);
        if (
          !survey ||
          !(
            await checkSurveyRead(deps.checkService, actor, survey.primary_managed_system_id, {
              tx,
            })
          ).allow
        )
          throw new HttpError('not_found.record', 'survey not found');
        if (survey.status === 'draft')
          throw new HttpError('conflict.survey_results_unavailable', 'survey results unavailable');
        const settings = await deps.resolveWorkspaceSettings(tx, actor.workspace_id);
        const audience = await resolveExcerptResultAudience(
          tx,
          deps.checkService,
          actor,
          survey.id,
          survey.primary_managed_system_id,
          settings.survey_anonymity_threshold,
        );
        const rows = await readEvidenceCandidatePage(
          tx,
          actor.workspace_id,
          survey.id,
          audience.questionIds,
          after,
          query.limit + 1,
        );
        const has_more = rows.length > query.limit;
        const items = rows.slice(0, query.limit).map((row) => ({
          ...row,
          survey_type: survey.type,
          survey_display_id: survey.display_id,
          identity_protected: survey.responses_identity_protected,
        }));
        const last = items.at(-1);
        const cursor =
          has_more && last
            ? Buffer.from(
                JSON.stringify({
                  workspace_id: actor.workspace_id,
                  actor_id: actor.actor_id,
                  survey_id: survey.id,
                  after: last.approved_excerpt_id,
                }),
              ).toString('base64url')
            : undefined;
        return surveyEvidenceCandidatesResponseSchema.parse({
          response_state: audience.response_state,
          items,
          page: { has_more, ...(cursor ? { cursor } : {}) },
        });
      },
      { isolationLevel: 'repeatable read' },
    );
  }
  return { getEvidenceCandidates };
}
