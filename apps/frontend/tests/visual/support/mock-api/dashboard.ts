import {
  dashboardSummarySchema,
  recoveryDetailSchema,
  recoveryHistoryQuerySchema,
  recoveryHistorySchema,
  recoveryListQuerySchema,
  recoveryListSchema,
  recoveryPresentationPatchSchema,
} from '@fops/shared';
import {
  coverageAnalyticsAreasFixture,
  coverageEmptySummaryFixture,
  coverageManagedSystemsFixture,
  coverageSummaryFixture,
} from '../../fixtures/coverage';
import {
  homeMyWorkTasksFixture,
  homeSummaryFixture,
  homeUnscopedSummaryFixture,
  homeZeroQueueSummaryFixture,
} from '../../fixtures/home';
import {
  RECOVERY_VISUAL_ID,
  recoveryVisualDetail,
  recoveryVisualHistory,
  recoveryVisualList,
} from '../../fixtures/recovery';
import { json } from './shared';
import type { MockApiHandler } from './shared';
import type { MockApiContext } from './types';

export function createDashboardHandlers(context: MockApiContext): MockApiHandler[] {
  const { options } = context;
  const handlers: MockApiHandler[] = [];

  let detail = recoveryVisualDetail(options.recovery);
  handlers.push(
    {
      method: 'GET',
      path: '/dashboard/recovery-items',
      handle: (route, _context, url) => {
        const query = recoveryListQuerySchema.parse(Object.fromEntries(url.searchParams));
        const list = recoveryVisualList(options.recovery);
        const { computed_at: _time, ...item } = detail;
        const visible = detail.presentation.state === 'visible';
        const eligible =
          list.total > 0 &&
          detail.state === 'active' &&
          (!query.category || query.category === detail.category) &&
          (query.managed_system_id === undefined ||
            query.managed_system_id === 'all' ||
            query.managed_system_id === detail.managed_system_id);
        return json(
          route,
          200,
          recoveryListSchema.parse({
            ...list,
            items: eligible && (query.presentation === 'visible') === visible ? [item] : [],
            total: eligible && (query.presentation === 'visible') === visible ? 1 : 0,
            visible_total: eligible && visible ? 1 : 0,
            hidden_total: eligible && !visible ? 1 : 0,
          }),
        );
      },
    },
    {
      method: 'GET',
      path: /^\/dashboard\/recovery-items\/[^/]+$/,
      handle: (route, _context, url) =>
        url.pathname.endsWith(RECOVERY_VISUAL_ID)
          ? json(route, 200, recoveryDetailSchema.parse(detail))
          : json(route, 404, { code: 'not_found.record' }),
    },
    {
      method: 'GET',
      path: '/dashboard/recovery-history',
      handle: (route, _context, url) => {
        recoveryHistoryQuerySchema.parse(Object.fromEntries(url.searchParams));
        return json(
          route,
          200,
          recoveryHistorySchema.parse(
            options.recovery
              ? recoveryVisualHistory()
              : { ...recoveryVisualHistory(), items: [], total: 0 },
          ),
        );
      },
    },
    {
      method: 'PATCH',
      path: /^\/dashboard\/recovery-items\/[^/]+\/presentation$/,
      handle: (route, _context, url) => {
        if (!url.pathname.endsWith(`${RECOVERY_VISUAL_ID}/presentation`))
          return json(route, 404, { code: 'not_found.record' });
        const body = recoveryPresentationPatchSchema.parse(route.request().postDataJSON());
        if (detail.state !== 'active' && body.action !== 'restore')
          return json(route, 409, { code: 'conflict.stale_write' });
        detail = recoveryDetailSchema.parse({
          ...detail,
          presentation:
            body.action === 'restore'
              ? { state: 'visible', snoozed_until: null }
              : body.action === 'mute'
                ? { state: 'muted', snoozed_until: null }
                : {
                    state: 'snoozed',
                    snoozed_until:
                      body.days === 1 ? '2026-07-22T09:00:00.000Z' : '2026-07-28T09:00:00.000Z',
                  },
        });
        return json(route, 200, detail);
      },
    },
  );
  const integrationDashboard = options.integrationDashboard;
  const home = options.home;
  const coverage = options.coverage;

  // Preserve the shared /dashboard/summary order: Integration Dashboard, Home, then Coverage.
  if (integrationDashboard) {
    handlers.push(
      {
        method: 'GET',
        path: '/dashboard/summary',
        handle: (route) =>
          json(route, integrationDashboard.summaryStatus, integrationDashboard.summaryBody),
      },
      {
        method: 'GET',
        path: '/managed-systems',
        handle: (route) => json(route, 200, integrationDashboard.managedSystems),
      },
    );
  }

  if (home) {
    handlers.push({
      method: 'GET',
      path: '/dashboard/summary',
      handle: (route) => {
        const summary =
          home === 'zero-queues'
            ? homeZeroQueueSummaryFixture
            : home === 'unscoped'
              ? homeUnscopedSummaryFixture
              : homeSummaryFixture;
        return json(route, 200, dashboardSummarySchema.parse(summary));
      },
    });
  }

  if (coverage) {
    handlers.push(
      {
        method: 'GET',
        path: '/dashboard/summary',
        handle: (route) =>
          json(
            route,
            200,
            dashboardSummarySchema.parse(
              coverage === 'empty' ? coverageEmptySummaryFixture : coverageSummaryFixture,
            ),
          ),
      },
      {
        method: 'GET',
        path: '/managed-systems',
        handle: (route) => json(route, 200, coverageManagedSystemsFixture),
      },
      {
        method: 'GET',
        path: '/analytics-areas',
        handle: (route) => json(route, 200, coverageAnalyticsAreasFixture),
      },
    );
  }

  // Keep Home's unfiltered task list ahead of Milestones' milestone_id-filtered list.
  if (home) {
    handlers.push({
      method: 'GET',
      path: '/tasks',
      handle: (route) =>
        json(route, 200, {
          items: home === 'populated' || home === 'unscoped' ? homeMyWorkTasksFixture : [],
        }),
    });
  }

  return handlers;
}
