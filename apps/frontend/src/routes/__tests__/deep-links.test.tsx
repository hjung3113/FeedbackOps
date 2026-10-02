import {
  DASHBOARD_ACTIONABLE_FINDINGS_ROUTE,
  DASHBOARD_HIGH_SEVERITY_UNLINKED_ROUTE,
  DASHBOARD_HOP_ROUTES,
  DASHBOARD_OUTCOME_SURVEYS_ROUTE,
  DASHBOARD_PERMISSION_REQUESTS_ROUTE,
  DASHBOARD_RELEASED_TASKS_ROUTE,
  DASHBOARD_UNASSIGNED_VOC_ROUTE,
  surveyRespondentFormDtoSchema,
} from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { HOME_COVERAGE_HREF } from '@/features/home/HomeScreen';
import { ME_QUERY_KEY } from '@/lib/auth/useMe';
import { routeTree } from '@/routeTree.gen';
import { ALL_SIDEBAR_ENTRIES } from '../_authed';

const respondentSurveyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const respondentForm = surveyRespondentFormDtoSchema.parse({
  survey: {
    id: respondentSurveyId,
    title: 'Q3 매출 리포트 사용성 진단',
    type: 'discovery',
    identity_protected: true,
  },
  questions: [
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      kind: 'text',
      prompt: '어떤 점이 좋았나요?',
      is_required: false,
      sort_order: 0,
      options: null,
      rating_min: null,
      rating_max: null,
      rating_low_label: null,
      rating_high_label: null,
      branch_parent_question_id: null,
      branch_trigger_option_key: null,
    },
  ],
});

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

  test('matches /surveys/participate to its static route instead of the Survey detail route', () => {
    const { foundRoute } = router.getMatchedRoutes('/surveys/participate');

    expect(foundRoute?.id).toBe('/_authed/surveys/participate');
  });

  test('renders respondent form without loading Survey management data', async () => {
    const requests: Array<{ method: string; pathname: string }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost');
      const method = init?.method ?? 'GET';
      requests.push({ method, pathname: url.pathname });

      if (method === 'GET' && url.pathname === `/surveys/${respondentSurveyId}/form`) {
        return jsonResponse(200, respondentForm);
      }
      if (method === 'GET' && url.pathname === `/surveys/${respondentSurveyId}`) {
        return jsonResponse(404, { code: 'not_found.record', message: 'survey not found' });
      }
      if (method === 'GET' && url.pathname === '/surveys') {
        return jsonResponse(200, { items: [], page: { has_more: false } });
      }
      if (method === 'GET' && url.pathname === '/nav/counts') {
        return jsonResponse(200, { counts: {} });
      }
      if (method === 'GET' && url.pathname === '/managed-systems') {
        return jsonResponse(200, { items: [], page: { has_more: false } });
      }
      if (method === 'GET' && url.pathname === '/me/permissions/scope') {
        return jsonResponse(200, { scope: { kind: 'all' } });
      }
      if (method === 'GET' && url.pathname === '/me/saved-views') {
        return jsonResponse(200, { items: [] });
      }
      return jsonResponse(200, {});
    });
    vi.stubGlobal('fetch', fetchMock as typeof globalThis.fetch);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(ME_QUERY_KEY, {
      actor: {
        id: '11111111-1111-4111-8111-111111111111',
        external_id: 'respondent',
        email: 'respondent@example.test',
        display_name: 'Survey respondent',
        role_level: 'user',
      },
      workspace_id: '22222222-2222-4222-8222-222222222222',
    });
    const routeRouter = createRouter({
      routeTree,
      context: { queryClient },
      history: createMemoryHistory({
        initialEntries: [`/surveys/${respondentSurveyId}/respond`],
      }),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={routeRouter} />
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId('survey-respondent-form')).toBeVisible();
    expect(screen.getByTestId('sidebar-nav-surveys-participate')).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(requests).toContainEqual({
      method: 'GET',
      pathname: `/surveys/${respondentSurveyId}/form`,
    });
    expect(requests).not.toContainEqual({
      method: 'GET',
      pathname: `/surveys/${respondentSurveyId}`,
    });
    expect(requests).not.toContainEqual({ method: 'GET', pathname: '/surveys' });
  });

  test('rejects a link when route validation drops one of its parameters', () => {
    expect(() => assertResolvable('/vocs?view=inbox&tab=not-a-voc-tab')).toThrow();
  });
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});
