import { answerableSurveysResponseSchema } from '@fops/shared';

import { decodeAnswerableSurveysCursor, listMyAnswerableSurveys } from './repo-read.js';
import type { SurveysActor, SurveysServiceDeps } from './service.js';

export interface MyAnswerableSurveysQuery {
  limit: number;
  cursor?: string;
}

export function createMyAnswerableSurveys(deps: SurveysServiceDeps) {
  async function getMyAnswerableSurveys(
    actor: Pick<SurveysActor, 'actor_id' | 'workspace_id'>,
    query: MyAnswerableSurveysQuery,
  ) {
    const cursor =
      query.cursor === undefined ? undefined : decodeAnswerableSurveysCursor(query.cursor);
    const response = await listMyAnswerableSurveys(deps.db, {
      workspace_id: actor.workspace_id,
      actor_id: actor.actor_id,
      limit: query.limit,
      ...(cursor === undefined ? {} : { cursor }),
    });
    return answerableSurveysResponseSchema.parse(response);
  }

  return { getMyAnswerableSurveys };
}
