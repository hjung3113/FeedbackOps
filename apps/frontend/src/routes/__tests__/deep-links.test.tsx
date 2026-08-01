import {
  DASHBOARD_ACTIONABLE_FINDINGS_ROUTE,
  DASHBOARD_HIGH_SEVERITY_UNLINKED_ROUTE,
  DASHBOARD_OUTCOME_SURVEYS_ROUTE,
  DASHBOARD_PERMISSION_REQUESTS_ROUTE,
  DASHBOARD_RELEASED_TASKS_ROUTE,
  DASHBOARD_UNASSIGNED_VOC_ROUTE,
} from '@fops/shared';
import { createRouter } from '@tanstack/react-router';
import { describe, expect, test } from 'vitest';

import { HOME_COVERAGE_HREF } from '@/features/home/HomeScreen';
import { routeTree } from '@/routeTree.gen';
import { ALL_SIDEBAR_ENTRIES } from '../_authed';

const router = createRouter({ routeTree });
const dashboardLinks = [
  DASHBOARD_UNASSIGNED_VOC_ROUTE,
  DASHBOARD_HIGH_SEVERITY_UNLINKED_ROUTE,
  DASHBOARD_ACTIONABLE_FINDINGS_ROUTE,
  DASHBOARD_RELEASED_TASKS_ROUTE,
  DASHBOARD_OUTCOME_SURVEYS_ROUTE,
  DASHBOARD_PERMISSION_REQUESTS_ROUTE,
];
const links = [
  ...new Set([
    ...dashboardLinks,
    ...ALL_SIDEBAR_ENTRIES.map((entry) => entry.href),
    HOME_COVERAGE_HREF,
  ]),
];

function assertResolvable(link: string): void {
  const url = new URL(link, 'http://localhost');
  expect(
    router.getMatchedRoutes(url.pathname).foundRoute,
    `No registered route for ${link}`,
  ).toBeDefined();
  try {
    router.matchRoutes(url.pathname, Object.fromEntries(url.searchParams), { throwOnError: true });
  } catch (error) {
    throw new Error(`Route search validation failed for ${link}: ${String(error)}`);
  }
}

describe('shipped deep-link contract', () => {
  test('matches every dashboard, sidebar, and Home deep link with valid search', () => {
    expect(links.length).toBeGreaterThan(0);
    links.forEach(assertResolvable);
  });

  test('rejects a missing route and an invalid VOC tab', () => {
    const missingRoute = '/missing-deep-link-route';
    const invalidVocTab = '/vocs?view=inbox&tab=not-a-voc-tab';

    expect(
      router.getMatchedRoutes(missingRoute).foundRoute,
      `Expected ${missingRoute} to have no route`,
    ).toBeUndefined();
    expect(
      () =>
        router.matchRoutes(
          '/vocs',
          { view: 'inbox', tab: 'not-a-voc-tab' },
          { throwOnError: true },
        ),
      `Expected ${invalidVocTab} to fail route search validation`,
    ).toThrow();
  });
});
