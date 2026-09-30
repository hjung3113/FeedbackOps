import { dashboardSummarySchema } from '@fops/shared';
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
import { json } from './shared';
import type { MockApiHandler } from './shared';
import type { MockApiContext } from './types';

export function createDashboardHandlers(context: MockApiContext): MockApiHandler[] {
  const { options } = context;
  const handlers: MockApiHandler[] = [];
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
