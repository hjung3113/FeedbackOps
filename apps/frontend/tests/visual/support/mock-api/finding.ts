import {
  attachSurveyEvidenceRequestSchema,
  createTaskRequestFromFindingRequestSchema,
  listEntityLinksResponseSchema,
  listEvidenceHighlightsResponseSchema,
} from '@fops/shared';
import {
  FINDING_DETAIL_IDS,
  SURVEY_EVIDENCE_IDS,
  evidenceHighlights,
  findingActors,
  findingAfterSurveyAttachment,
  findingAnalyticsAreas,
  findingList,
  findingListAfterSurveyAttachment,
  findingManagedSystems,
  findingSourceVoc,
  linkedTask,
  populatedFinding,
  requestTaskSuccess,
  surveyEvidenceAttached,
  surveyEvidenceCandidates,
  surveyEvidenceCatalog,
  surveyEvidenceHighlight,
  surveyEvidenceManagedSystems,
  surveyEvidenceStates,
} from '../../fixtures/finding-detail';
import { json } from './shared';
import type { MockApiHandler } from './shared';
import type { MockApiContext } from './types';

const findingEntityLinks = listEntityLinksResponseSchema.parse({ items: [] });

export function createFindingHandlers(context: MockApiContext): MockApiHandler[] {
  if (!context.options.findingDetail) return [];

  let attached = false;
  let attempts = 0;
  let revoked = false;

  return [
    {
      method: 'GET',
      path: '/surveys',
      handle: (route) => json(route, 200, surveyEvidenceCatalog),
    },
    {
      method: 'GET',
      path: `/surveys/${SURVEY_EVIDENCE_IDS.survey}/evidence-candidates`,
      handle: (route) => {
        const state = context.options.findingSurveyEvidence;
        if (state === 'denied')
          return json(route, 404, { code: 'not_found.record', message: 'missing' });
        const page = revoked
          ? surveyEvidenceStates.empty
          : state === 'none' || state === 'suppressed' || state === 'empty'
            ? surveyEvidenceStates[state]
            : surveyEvidenceCandidates;
        return json(route, 200, page);
      },
    },
    {
      method: 'POST',
      path: `/findings/${FINDING_DETAIL_IDS.finding}/survey-evidence`,
      handle: async (route, mockContext, url) => {
        const request = route.request();
        const body = attachSurveyEvidenceRequestSchema.parse(request.postDataJSON());
        const key = await request.headerValue('Idempotency-Key');
        if (
          body.approved_excerpt_id !== SURVEY_EVIDENCE_IDS.excerpt ||
          key === null ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)
        )
          throw new Error('Invalid Survey attachment');
        mockContext.postedBodies.push(body);
        mockContext.postedRequests.push({ body, idempotencyKey: key, pathname: url.pathname });
        attempts += 1;
        if (context.options.findingSurveyEvidence === 'retry' && attempts === 1)
          return json(route, 500, { code: 'internal.unexpected', message: 'failed' });
        if (context.options.findingSurveyEvidence === 'revoked') {
          revoked = true;
          return json(route, 422, { code: 'validation.failed', message: 'unavailable' });
        }
        attached = true;
        return json(route, 201, surveyEvidenceAttached);
      },
    },
    {
      method: 'GET',
      path: '/actors',
      handle: (route) => json(route, 200, findingActors),
    },
    {
      method: 'GET',
      path: `/vocs/${FINDING_DETAIL_IDS.voc}`,
      handle: (route) => json(route, 200, findingSourceVoc),
    },
    {
      method: 'GET',
      path: `/tasks/${FINDING_DETAIL_IDS.task}`,
      handle: (route) => json(route, 200, linkedTask),
    },
    {
      method: 'GET',
      path: '/task-requests',
      handle: (route) => json(route, 200, { items: [] }),
    },
    {
      method: 'GET',
      path: '/managed-systems',
      handle: (route) =>
        json(
          route,
          200,
          context.options.findingSurveyEvidence
            ? surveyEvidenceManagedSystems
            : findingManagedSystems,
        ),
    },
    {
      method: 'GET',
      path: '/analytics-areas',
      handle: (route) => json(route, 200, findingAnalyticsAreas),
    },
    {
      method: 'GET',
      path: '/findings',
      handle: (route) =>
        json(route, 200, attached ? findingListAfterSurveyAttachment : findingList),
    },
    {
      method: 'GET',
      path: `/findings/${FINDING_DETAIL_IDS.finding}`,
      handle: (route) =>
        json(route, 200, attached ? findingAfterSurveyAttachment : populatedFinding),
    },
    {
      method: 'GET',
      path: `/findings/${FINDING_DETAIL_IDS.finding}/evidence-highlights`,
      handle: (route) =>
        json(
          route,
          200,
          listEvidenceHighlightsResponseSchema.parse({
            items: attached
              ? [...evidenceHighlights.items, surveyEvidenceHighlight]
              : evidenceHighlights.items,
          }),
        ),
    },
    {
      method: 'GET',
      path: '/entity-links',
      handle: (route) => json(route, 200, findingEntityLinks),
    },
    {
      method: 'POST',
      path: `/findings/${FINDING_DETAIL_IDS.finding}/request-task`,
      handle: async (route, mockContext, url) => {
        const request = route.request();
        const body = createTaskRequestFromFindingRequestSchema.parse(request.postDataJSON());
        mockContext.postedBodies.push(body);
        mockContext.postedRequests.push({
          body,
          idempotencyKey: await request.headerValue('Idempotency-Key'),
          pathname: url.pathname,
        });
        await json(route, 201, requestTaskSuccess);
      },
    },
  ];
}
