import {
  createMilestoneRequestSchema,
  milestoneDtoSchema,
  patchMilestoneRequestSchema,
} from '@fops/shared';
import {
  MILESTONE_ACTOR_IDS,
  MILESTONE_IDS,
  milestoneActorsFixture,
  milestoneAnalyticsAreasFixture,
  milestoneDetailFixture,
  milestoneListFixture,
  milestoneManagedSystemsFixture,
  milestoneTasksFixture,
} from '../../fixtures/milestones';
import { json } from './shared';
import type { MockApiHandler } from './shared';
import type { MockApiContext } from '../types';

export function createMilestoneHandlers(context: MockApiContext): MockApiHandler[] {
  if (!context.options.milestones) return [];

  const { milestones } = context.options;
  return [
    {
      method: 'GET',
      path: '/milestones',
      handle: (route, _mockContext, url) => {
        if (milestones === 'empty') return json(route, 200, { items: [] });
        const status = url.searchParams.get('status');
        return json(route, 200, {
          items:
            status === null
              ? milestoneListFixture
              : milestoneListFixture.filter((milestone) => milestone.status === status),
        });
      },
    },
    {
      method: 'GET',
      path: `/milestones/${MILESTONE_IDS.sso}`,
      handle: (route) =>
        milestones === 'denied-detail'
          ? json(route, 403, { code: 'permission.denied', message: 'finding.manage required' })
          : json(route, 200, milestoneDetailFixture),
    },
    {
      method: 'GET',
      path: '/tasks',
      query: (params) => params.has('milestone_id'),
      handle: (route, _mockContext, url) =>
        json(route, 200, {
          items:
            url.searchParams.get('milestone_id') === MILESTONE_IDS.sso ? milestoneTasksFixture : [],
        }),
    },
    {
      method: 'POST',
      path: '/milestones',
      handle: async (route, mockContext, url) => {
        const request = route.request();
        const body = createMilestoneRequestSchema.parse(request.postDataJSON());
        mockContext.postedBodies.push(body);
        mockContext.postedRequests.push({
          body,
          idempotencyKey: await request.headerValue('Idempotency-Key'),
          pathname: url.pathname,
        });
        const { source_finding: _detailOnly, ...row } = milestoneDetailFixture;
        await json(
          route,
          201,
          milestoneDtoSchema.parse({
            ...row,
            id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb1099',
            display_id: 'MLS-1099',
            title: body.title,
            why: body.why,
            primary_managed_system_id: body.primary_managed_system_id,
            start_date: body.start_date,
            target_date: body.target_date,
            status: 'planning',
            analytics_area_id: body.analytics_area_id ?? null,
            owner_actor_id: body.owner_actor_id ?? MILESTONE_ACTOR_IDS.u1,
            created_by: body.owner_actor_id ?? MILESTONE_ACTOR_IDS.u1,
            created_at: '2026-07-22T00:00:00.000Z',
            updated_at: '2026-07-22T00:00:00.000Z',
            progress: { released_done: 0, in_flight: 0, queued: 0, total: 0, percent: 0 },
          }),
        );
      },
    },
    {
      method: 'PATCH',
      path: `/milestones/${MILESTONE_IDS.sso}`,
      handle: async (route, mockContext, url) => {
        const request = route.request();
        const body = patchMilestoneRequestSchema.parse(request.postDataJSON());
        mockContext.postedBodies.push(body);
        mockContext.postedRequests.push({
          body,
          idempotencyKey: await request.headerValue('Idempotency-Key'),
          pathname: url.pathname,
        });
        const { source_finding: _detailOnly, ...row } = milestoneDetailFixture;
        await json(
          route,
          200,
          milestoneDtoSchema.parse({
            ...row,
            ...(body.title !== undefined ? { title: body.title } : {}),
            updated_at: '2026-07-23T00:00:00.000Z',
          }),
        );
      },
    },
    {
      method: 'GET',
      path: '/actors',
      handle: (route) => json(route, 200, milestoneActorsFixture),
    },
    {
      method: 'GET',
      path: '/managed-systems',
      handle: (route) => json(route, 200, milestoneManagedSystemsFixture),
    },
    {
      method: 'GET',
      path: '/analytics-areas',
      handle: (route) => json(route, 200, milestoneAnalyticsAreasFixture),
    },
  ];
}
