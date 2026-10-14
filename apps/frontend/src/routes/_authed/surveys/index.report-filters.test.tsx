// ADR-0069 report filters at the rendered Survey route and HTTP seams.
import { listSurveysQuerySchema } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, expect, test, vi } from 'vitest';

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

vi.mock('@/lib/useAnalyticsAreaFilterLabel', () => ({
  useAnalyticsAreaFilterLabel: (area: string | undefined) =>
    area === 'unset' ? 'Analytics Area: 미지정' : areaLabel,
}));
let areaLabel = 'Analytics Area: Revenue';
import { SurveysIndexRoute, surveysSearchSchema } from './index';

// uuid-shaped ids — the search schema rejects non-uuid values.
const MS_1 = '99999999-9999-9999-9999-999999999901';
const MS_2 = '99999999-9999-9999-9999-999999999902';
const S1_ID = '11111111-1111-4111-8111-111111111111';
const S2_ID = '44444444-4444-4444-4444-444444444444';
const ACTOR_1 = '33333333-3333-4333-8333-333333333333';

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
  namedLookups?: boolean;
  emptyList?: boolean;
}

function installFetch(c: FetchCase): void {
  const surveys = c.namedLookups
    ? SURVEYS.map((survey) =>
        survey.id === S1_ID ? { ...survey, operator_actor_id: ACTOR_1 } : survey,
      )
    : SURVEYS;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    c.requested.push(url);
    const path = new URL(url, 'http://localhost');
    if (path.pathname === '/surveys') {
      if (c.failList) return jsonResponse({ code: 'internal.unexpected' }, 500);
      listSurveysQuerySchema.parse(Object.fromEntries(path.searchParams));
      if (c.emptyList) return jsonResponse([]);
      const msFilter = path.searchParams.get('managed_system_id');
      const items = msFilter
        ? surveys.filter((survey) => survey.primary_managed_system_id === msFilter)
        : surveys;
      return jsonResponse(items);
    }
    if (path.pathname === '/managed-systems')
      return jsonResponse({
        items: c.namedLookups ? [{ id: MS_1, name: 'Revenue Analytics' }] : [],
        total: c.namedLookups ? 1 : 0,
      });
    if (path.pathname === '/actors')
      return jsonResponse({
        actors: c.namedLookups
          ? [
              {
                id: ACTOR_1,
                display_name: 'Named Operator',
                email: 'operator@example.com',
                role_level: 'user',
              },
            ]
          : [],
      });
    if (path.pathname.startsWith('/surveys/')) {
      const survey = surveys.find((entry) => entry.id === path.pathname.split('/')[2]);
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const filters = { 'filter.analytics_area': 'unset', status: 'open', follow_up: 'needed' } as const;
const initial = `/surveys?managedSystem=${MS_1}&${new URLSearchParams(filters)}`;

test('forwards Survey filters and keeps them through selection and close', async () => {
  const c = { requested: [] as string[] };
  const router = renderUrlState(c, initial);
  fireEvent.click(await screen.findByTestId(`survey-row-${S1_ID}`));
  await screen.findByTestId('survey-detail');
  expect(router.state.location.search).toEqual({
    ...filters,
    managedSystem: MS_1,
    selected: S1_ID,
  });
  const query = c.requested
    .map((url) => new URL(url, 'http://localhost'))
    .find((url) => url.pathname === '/surveys');
  if (!query) throw new Error('Survey list request missing');
  expect(listSurveysQuerySchema.parse(Object.fromEntries(query.searchParams))).toEqual({
    managed_system_id: MS_1,
    analytics_area_id: 'unset',
    status: 'open',
    follow_up: 'needed',
  });
  fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
  await waitFor(() =>
    expect(router.state.location.search).toEqual({ ...filters, managedSystem: MS_1 }),
  );
});

test('removes one filter, restores Back/Forward, and clear-all keeps selected and scope', async () => {
  const router = renderUrlState({ requested: [] }, `${initial}&selected=${S1_ID}`);
  await screen.findByTestId('survey-detail');
  fireEvent.click(screen.getByRole('button', { name: '후속 조치 필요 필터 제거' }));
  const { follow_up: _followUp, ...remaining } = filters;
  await waitFor(() =>
    expect(router.state.location.search).toEqual({
      ...remaining,
      managedSystem: MS_1,
      selected: S1_ID,
    }),
  );
  await act(async () => {
    router.history.back();
  });
  await waitFor(() => expect(router.state.location.search.follow_up).toBe('needed'));
  expect(
    await screen.findByRole('button', { name: '후속 조치 필요 필터 제거' }),
  ).toBeInTheDocument();
  await act(async () => {
    router.history.forward();
  });
  await waitFor(() => expect(router.state.location.search.follow_up).toBeUndefined());
  fireEvent.click(screen.getByRole('button', { name: '필터 초기화' }));
  await waitFor(() =>
    expect(router.state.location.search).toEqual({ managedSystem: MS_1, selected: S1_ID }),
  );
});

test.each([
  ['unset', 'Analytics Area: 미지정'],
  [MS_1, 'Analytics Area: Revenue'],
  [MS_1, 'Analytics Area: Revenue (보관됨)'],
  [MS_1, 'Analytics Area: 선택한 Area'],
])('renders and removes Survey Area %s as %s', async (area, label) => {
  areaLabel = label;
  const router = renderUrlState(
    { requested: [] },
    `/surveys?filter.analytics_area=${area}&follow_up=needed`,
  );
  fireEvent.click(await screen.findByRole('button', { name: `${label} 필터 제거` }));
  await waitFor(() => expect(router.state.location.search).toEqual({ follow_up: 'needed' }));
});

test('URL-filtered empty names the filters and has only the filter-bar reset', async () => {
  const router = renderUrlState({ requested: [], emptyList: true }, `${initial}&selected=${S1_ID}`);
  expect(await screen.findByText('현재 조건에 맞는 Survey가 없습니다')).toBeInTheDocument();
  expect(
    screen.getByText('Analytics Area: 미지정 · 상태: 진행 중 · 후속 조치 필요'),
  ).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: '필터 초기화' })).toHaveLength(1);
  await waitFor(() =>
    expect(router.state.location.search).toEqual({ ...filters, managedSystem: MS_1 }),
  );
});

test('URL filters intersect local tabs/search without adding another reset', async () => {
  renderUrlState({ requested: [] }, initial);
  await screen.findByTestId(`survey-row-${S1_ID}`);
  fireEvent.mouseDown(screen.getByRole('tab', { name: /^종료됨/ }));
  expect(await screen.findByText('현재 조건에 맞는 Survey가 없습니다')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: '필터 초기화' })).toHaveLength(1);
});

test('one reset clears URL Area, local search and status tab', async () => {
  const router = renderUrlState(
    { requested: [] },
    `/surveys?managedSystem=${MS_1}&filter.analytics_area=unset`,
  );
  await screen.findByTestId(`survey-row-${S1_ID}`);
  fireEvent.mouseDown(screen.getByRole('tab', { name: /^종료됨/ }));
  const search = screen.getByRole('textbox', { name: 'Survey 검색' });
  fireEvent.change(search, { target: { value: 'zzz' } });
  expect(screen.getByText('현재 조건에 맞는 Survey가 없습니다')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '필터 초기화' }));
  await waitFor(() => expect(router.state.location.search).toEqual({ managedSystem: MS_1 }));
  expect(await screen.findByTestId(`survey-row-${S1_ID}`)).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Survey 검색' })).toHaveValue('');
  expect(screen.getByRole('tab', { name: /^전체/ })).toHaveAttribute('aria-selected', 'true');
  expect(screen.queryByRole('button', { name: '필터 초기화' })).not.toBeInTheDocument();
});

test('local-only search keeps its existing filtered-empty reset', async () => {
  renderUrlState({ requested: [] }, '/surveys');
  await screen.findByTestId(`survey-row-${S1_ID}`);
  fireEvent.change(screen.getByRole('textbox', { name: 'Survey 검색' }), {
    target: { value: 'no-match' },
  });
  expect(await screen.findByText('현재 조건에 맞는 Survey가 없습니다')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: '필터 초기화' })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: '필터 초기화' }));
  expect(await screen.findByTestId(`survey-row-${S1_ID}`)).toBeInTheDocument();
});

test.each([
  ['filter.analytics_area', 'Analytics Area: 미지정'],
  ['status', '상태: 진행 중'],
  ['follow_up', '후속 조치 필요'],
] as const)(
  'removes only Survey %s and requests the remaining intersection',
  async (key, label) => {
    const c = { requested: [] as string[] };
    const router = renderUrlState(c, initial);
    fireEvent.click(await screen.findByRole('button', { name: `${label} 필터 제거` }));
    const expected: Partial<typeof filters> = { ...filters };
    delete expected[key];
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ ...expected, managedSystem: MS_1 }),
    );
    const expectedWire = {
      managed_system_id: MS_1,
      ...(key === 'filter.analytics_area' ? {} : { analytics_area_id: 'unset' }),
      ...(key === 'status' ? {} : { status: 'open' }),
      ...(key === 'follow_up' ? {} : { follow_up: 'needed' }),
    };
    await waitFor(() => {
      const query = c.requested
        .map((url) => new URL(url, 'http://localhost'))
        .filter((url) => url.pathname === '/surveys')
        .at(-1);
      if (!query) throw new Error('Survey list request missing');
      expect(listSurveysQuerySchema.parse(Object.fromEntries(query.searchParams))).toEqual(
        expectedWire,
      );
    });
  },
);
