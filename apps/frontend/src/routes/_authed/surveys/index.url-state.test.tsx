// /surveys URL-state tests (issue #396).
//
// Selection + Managed System scope are URL state (docs/frontend/routes-and-layout.md
// §URL State Rules): /surveys?managedSystem=:managedSystemId|all&selected=:surveyId.
// Verifies restore-on-load, push-on-select with working Back, replace-away of a
// stale selection, a failed list load never clearing a deep-linked selection, and
// the managed_system_id wire contract. The route has no Managed System selector
// UI and no first-row defaulting — neither is introduced here.
//
// Harness: createRoute + memory history with the route's own search schema (same
// pattern as ../admin/analytics-areas.url-state.test.tsx); fetch mocked globally.
// Stub detail/result routes exist only so SurveyDetail's Links resolve.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('@fops/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fops/ui')>();
  return {
    ...actual,
    // The real ListShell only mounts the detail panel at desktop breakpoints;
    // render it unconditionally so selection is observable (same approach as
    // ../admin/permissions/requests.url-state.test.tsx).
    ListShell: ({
      toolbar,
      tabs,
      list,
      detailPanel,
    }: {
      toolbar?: { title?: string; subtitle?: string };
      tabs?: React.ReactNode;
      list: React.ReactNode;
      detailPanel?: React.ReactNode;
    }) => (
      <div data-shell="list">
        <header>
          <h2>{toolbar?.title}</h2>
          <span>{toolbar?.subtitle}</span>
        </header>
        {tabs}
        {list}
        {detailPanel}
      </div>
    ),
  };
});

import { SurveysIndexRoute, surveysSearchSchema } from './index';

// uuid-shaped ids — the search schema rejects non-uuid values.
const MS_1 = '99999999-9999-9999-9999-999999999901';
const MS_2 = '99999999-9999-9999-9999-999999999902';
const S1_ID = '11111111-1111-4111-8111-111111111111';
const S2_ID = '44444444-4444-4444-4444-444444444444';
const STALE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const S1 = {
  id: S1_ID,
  workspace_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  display_id: 'SRV-1',
  type: 'discovery',
  status: 'open',
  title: '온보딩 설문',
  description: null,
  primary_managed_system_id: MS_1,
  analytics_area_id: null,
  operator_actor_id: null,
  responses_identity_protected: true,
  created_by: '22222222-2222-4222-8222-222222222222',
  opened_at: '2026-01-02T00:00:00.000Z',
  closed_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  questions: [],
};

const SURVEYS = [
  S1,
  {
    ...S1,
    id: S2_ID,
    display_id: 'SRV-2',
    type: 'validation',
    status: 'closed',
    title: '결과 확인 설문',
    primary_managed_system_id: MS_2,
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

interface FetchCase {
  /** Every requested URL, in order — used for the managed_system_id assertions. */
  requested: string[];
  failList?: boolean;
}

function installFetch(c: FetchCase): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    c.requested.push(url);
    const path = new URL(url, 'http://localhost');
    if (path.pathname === '/surveys') {
      if (c.failList) return jsonResponse({ code: 'internal.unexpected' }, 500);
      const msFilter = path.searchParams.get('managed_system_id');
      const items = msFilter
        ? SURVEYS.filter((survey) => survey.primary_managed_system_id === msFilter)
        : SURVEYS;
      return jsonResponse(items);
    }
    if (path.pathname.startsWith('/surveys/')) {
      const survey = SURVEYS.find((entry) => entry.id === path.pathname.split('/')[2]);
      return survey ? jsonResponse(survey) : jsonResponse({ code: 'not_found.record' }, 404);
    }
    if (path.pathname === '/me')
      return jsonResponse({
        actor: {
          id: '22222222-2222-4222-8222-222222222222',
          external_id: 'user-1',
          email: 'user@example.com',
          display_name: '사용자',
          role_level: 'user',
        },
        workspace_id: 'ws',
      });
    if (path.pathname === '/me/permissions/check')
      return jsonResponse({
        state: 'approved',
        decision: { allow: true, via: 'role', requestable: null },
      });
    return jsonResponse({ code: 'not_mocked' }, 500);
  }) as typeof globalThis.fetch;
}

function renderUrlState(c: FetchCase, initialPath: string) {
  installFetch(c);
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: '/surveys',
    validateSearch: (raw) => surveysSearchSchema.parse(raw),
    component: SurveysIndexRoute,
  });
  const surveyDetailStub = createRoute({
    getParentRoute: () => rootRoute,
    path: '/surveys/$surveyId',
    component: () => null,
  });
  const surveyResultsStub = createRoute({
    getParentRoute: () => rootRoute,
    path: '/surveys/$surveyId/results',
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([route, surveyDetailStub, surveyResultsStub]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('/surveys URL state', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('?selected=<id> opens that survey after load and keeps the list context', async () => {
    const router = renderUrlState({ requested: [] }, `/surveys?selected=${S1_ID}`);
    const detail = await screen.findByTestId('survey-detail');
    expect(detail).toHaveTextContent('온보딩 설문');
    // List rendered alongside the detail — restore is not detail-only.
    expect(screen.getByTestId(`survey-row-${S1_ID}`)).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ selected: S1_ID });
  });

  test('row click pushes selected and Back returns to no selection', async () => {
    const router = renderUrlState({ requested: [] }, '/surveys');
    await waitFor(() => expect(screen.getByTestId(`survey-row-${S1_ID}`)).toBeInTheDocument());
    const lengthBefore = router.history.length;

    fireEvent.click(screen.getByTestId(`survey-row-${S1_ID}`));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ selected: S1_ID });
    });
    await waitFor(() =>
      expect(screen.getByTestId('survey-detail')).toHaveTextContent('온보딩 설문'),
    );
    expect(router.history.length).toBe(lengthBefore + 1);

    router.history.back();
    await waitFor(() => {
      expect(screen.queryByTestId('survey-detail')).not.toBeInTheDocument();
    });
    expect(router.state.location.search).toEqual({});
    // Rows still rendered → the closed-panel assertion is not vacuous.
    expect(screen.getByTestId(`survey-row-${S1_ID}`)).toBeInTheDocument();
  });

  test('stale selected uuid not in the list is replaced away after load', async () => {
    const router = renderUrlState({ requested: [] }, `/surveys?selected=${STALE_ID}`);
    await waitFor(() => expect(screen.getByTestId(`survey-row-${S1_ID}`)).toBeInTheDocument());
    await waitFor(() => {
      expect(router.state.location.search).toEqual({});
    });
    // Replaced, not pushed: history did not grow.
    expect(router.history.length).toBe(1);
    expect(screen.queryByTestId('survey-detail')).not.toBeInTheDocument();
    expect(screen.getByTestId(`survey-row-${S1_ID}`)).toBeInTheDocument();
  });

  test('a failed list fetch does not clear a deep-linked selected', async () => {
    const router = renderUrlState({ requested: [], failList: true }, `/surveys?selected=${S1_ID}`);
    // 4s: the list hook retries one 5xx before settling into the error state.
    await waitFor(() => expect(screen.getByTestId('survey-list-error')).toBeInTheDocument(), {
      timeout: 4000,
    });
    expect(router.state.location.search).toEqual({ selected: S1_ID });
  });

  test('managedSystem=all sends no managed_system_id; a uuid sends it', async () => {
    const all: FetchCase = { requested: [] };
    renderUrlState(all, '/surveys?managedSystem=all');
    await waitFor(() => expect(screen.getByTestId(`survey-row-${S1_ID}`)).toBeInTheDocument());
    const plainListFetch = all.requested.find((url) => url === '/surveys');
    expect(plainListFetch).toBeDefined();
    expect(
      all.requested.some((url) => url.startsWith('/surveys') && url.includes('managed_system_id')),
    ).toBe(false);

    cleanup();

    const scoped: FetchCase = { requested: [] };
    renderUrlState(scoped, `/surveys?managedSystem=${MS_1}`);
    await waitFor(() => expect(screen.getByTestId(`survey-row-${S1_ID}`)).toBeInTheDocument());
    expect(
      scoped.requested.some(
        (url) => url.startsWith('/surveys') && url.includes(`managed_system_id=${MS_1}`),
      ),
    ).toBe(true);
    // Only the MS_1 survey is in the scoped list.
    expect(screen.queryByTestId(`survey-row-${S2_ID}`)).not.toBeInTheDocument();
  });

  test('strict search schema rejects invalid values and unknown keys', () => {
    expect(() => surveysSearchSchema.parse({ selected: 'not-a-uuid' })).toThrow();
    expect(() => surveysSearchSchema.parse({ managedSystem: 'workspace' })).toThrow();
    expect(() => surveysSearchSchema.parse({ selected: S1_ID, onload: 'x' })).toThrow();
    expect(surveysSearchSchema.parse({})).toEqual({});
    expect(surveysSearchSchema.parse({ managedSystem: 'all' })).toEqual({
      managedSystem: 'all',
    });
  });
});
