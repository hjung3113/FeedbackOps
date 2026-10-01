import {
  createTaskRequestFromFindingRequestSchema,
  listEntityLinksResponseSchema,
} from '@fops/shared';
import {
  FINDING_DETAIL_IDS,
  evidenceHighlights,
  findingActors,
  findingAnalyticsAreas,
  findingList,
  findingManagedSystems,
  findingSourceVoc,
  linkedTask,
  populatedFinding,
  requestTaskSuccess,
} from '../../fixtures/finding-detail';
import { json } from './shared';
import type { MockApiHandler } from './shared';
import type { MockApiContext } from './types';

const findingEntityLinks = listEntityLinksResponseSchema.parse({ items: [] });

export function createFindingHandlers(context: MockApiContext): MockApiHandler[] {
  if (!context.options.findingDetail) return [];

  return [
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
      handle: (route) => json(route, 200, findingManagedSystems),
    },
    {
      method: 'GET',
      path: '/analytics-areas',
      handle: (route) => json(route, 200, findingAnalyticsAreas),
    },
    {
      method: 'GET',
      path: '/findings',
      handle: (route) => json(route, 200, findingList),
    },
    {
      method: 'GET',
      path: `/findings/${FINDING_DETAIL_IDS.finding}`,
      handle: (route) => json(route, 200, populatedFinding),
    },
    {
      method: 'GET',
      path: `/findings/${FINDING_DETAIL_IDS.finding}/evidence-highlights`,
      handle: (route) => json(route, 200, evidenceHighlights),
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
