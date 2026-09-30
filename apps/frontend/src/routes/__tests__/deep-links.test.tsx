import {
  DASHBOARD_ACTIONABLE_FINDINGS_ROUTE,
  DASHBOARD_HIGH_SEVERITY_UNLINKED_ROUTE,
  DASHBOARD_HOP_ROUTES,
  DASHBOARD_OUTCOME_SURVEYS_ROUTE,
  DASHBOARD_PERMISSION_REQUESTS_ROUTE,
  DASHBOARD_RELEASED_TASKS_ROUTE,
  DASHBOARD_UNASSIGNED_VOC_ROUTE,
} from '@fops/shared';
import { QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { describe, expect, test } from 'vitest';

import { HOME_COVERAGE_HREF } from '@/features/home/HomeScreen';
import { routeTree } from '@/routeTree.gen';
import { ALL_SIDEBAR_ENTRIES } from '../_authed';

const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
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
    // N13: every coverage/queue one-hop route must resolve against the strict
    // route search schemas (tab=no-task, execution=none,
    // filter.analytics_area=unset, public_update=missing).
    ...Object.values(DASHBOARD_HOP_ROUTES),
    ...ALL_SIDEBAR_ENTRIES.map((entry) => entry.href),
    HOME_COVERAGE_HREF,
  ]),
];

function assertResolvable(link: string): void {
  const url = new URL(link, 'http://localhost');
  const parsedSearch = router.options.parseSearch(url.search);
  const { foundRoute, matchedRoutes } = router.getMatchedRoutes(url.pathname);
  expect(foundRoute, `No registered route for ${link}`).toBeDefined();
  try {
    router.matchRoutes(url.pathname, parsedSearch, { throwOnError: true });
  } catch (error) {
    throw new Error(`Route search validation failed for ${link}: ${String(error)}`);
  }

  const searchRoute = [...matchedRoutes]
    .reverse()
    .find((route) => route.options.validateSearch !== undefined);
  const validateSearch = searchRoute?.options.validateSearch;
  if (validateSearch === undefined) {
    expect(Object.keys(parsedSearch), `No search validator found for ${link}`).toHaveLength(0);
    return;
  }
  if (typeof validateSearch !== 'function') {
    throw new Error(`Search validator for ${link} is not a function`);
  }

  expect(
    validateSearch(parsedSearch),
    `Route search validation dropped or changed a parameter from ${link}`,
  ).toEqual(expect.objectContaining(parsedSearch));
}

describe('shipped deep-link contract', () => {
  test('matches every dashboard, sidebar, and Home deep link with valid search', () => {
    expect(links.length).toBeGreaterThan(0);
    links.forEach(assertResolvable);
  });

  test('leaves missing routes unmatched and tolerates an invalid VOC tab', () => {
    const missingRoute = '/missing-deep-link-route';

    expect(
      router.getMatchedRoutes(missingRoute).foundRoute,
      `Expected ${missingRoute} to have no route`,
    ).toBeUndefined();
    expect(() =>
      router.matchRoutes('/vocs', { view: 'inbox', tab: 'not-a-voc-tab' }, { throwOnError: true }),
    ).not.toThrow();
  });

  test('rejects a link when route validation drops one of its parameters', () => {
    expect(() => assertResolvable('/vocs?view=inbox&tab=not-a-voc-tab')).toThrow();
  });
});
