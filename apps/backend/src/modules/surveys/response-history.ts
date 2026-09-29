import { mySurveyResponsesResponseSchema } from '@fops/shared';

import { decodeSurveyResponseHistoryCursor, listMySurveyResponseHistory } from './repo-read.js';
import type { SurveysActor, SurveysServiceDeps } from './service.js';

export interface MySurveyResponsesQuery {
  limit: number;
  cursor?: string;
}

export function createMySurveyResponseHistory(deps: SurveysServiceDeps) {
  async function getMySurveyResponses(
    actor: Pick<SurveysActor, 'actor_id' | 'workspace_id'>,
    query: MySurveyResponsesQuery,
  ) {
    const cursor =
      query.cursor === undefined ? undefined : decodeSurveyResponseHistoryCursor(query.cursor);
    const response = await listMySurveyResponseHistory(deps.db, {
      workspace_id: actor.workspace_id,
      actor_id: actor.actor_id,
      limit: query.limit,
      ...(cursor === undefined ? {} : { cursor }),
    });
    return mySurveyResponsesResponseSchema.parse(response);
  }

  return { getMySurveyResponses };
}
