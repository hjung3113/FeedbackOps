import { ME_QUERY_KEY } from '@/lib/auth/useMe';
import { routeTree } from '@/routeTree.gen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, expect, test, vi } from 'vitest';

vi.mock('@fops/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fops/ui')>();
  return {
    ...actual,
    ListShell: ({
      toolbar,
      list,
      detailPanel,
    }: {
      toolbar?: { title?: string };
      list: React.ReactNode;
      detailPanel?: React.ReactNode;
    }) => (
      <div data-shell="list">
        <h2>{toolbar?.title}</h2>
        {list}
        {detailPanel}
      </div>
    ),
  };
});

const SURVEY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SYSTEM_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';

function survey(id: string, title: string) {
  return {
    id,
    display_id: id === SURVEY_ID ? 'SRV-1' : 'SRV-2',
    type: 'discovery',
    status: 'open',
    title,
    description: null,
    primary_managed_system_id: SYSTEM_ID,
    analytics_area_id: null,
    operator_actor_id: null,
    responses_identity_protected: true,
    created_by: ACTOR_ID,
    opened_at: '2026-07-20T00:00:00.000Z',
    closed_at: null,
    created_at: '2026-07-20T00:00:00.000Z',
    updated_at: '2026-07-20T00:00:00.000Z',
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test('detail list keeps filter context through chips and selection, then close restores the index', async () => {
  const requested: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      requested.push(`${url.pathname}${url.search}`);
      if (url.pathname === '/surveys') {
        return jsonResponse([survey(SURVEY_ID, '온보딩 설문'), survey(OTHER_ID, '결과 확인 설문')]);
      }
      if (url.pathname === `/surveys/${SURVEY_ID}`) {
        return jsonResponse({ ...survey(SURVEY_ID, '온보딩 설문'), questions: [] });
      }
      if (url.pathname === `/surveys/${OTHER_ID}`) {
        return jsonResponse({ ...survey(OTHER_ID, '결과 확인 설문'), questions: [] });
      }
      if (url.pathname === '/me/permissions/scope') {
        return jsonResponse({ scope: { kind: 'all' } });
      }
      if (url.pathname === '/me/permissions/check') {
        return jsonResponse({ state: 'approved', decision: { allow: true } });
      }
      if (url.pathname === '/nav/counts') return jsonResponse({ counts: {} });
      if (url.pathname === '/managed-systems') return jsonResponse({ items: [], total: 0 });
      if (url.pathname === '/actors') return jsonResponse({ actors: [] });
      if (url.pathname === '/me/saved-views') return jsonResponse({ items: [] });
      return jsonResponse({});
    }),
  );

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(ME_QUERY_KEY, {
    actor: {
      id: ACTOR_ID,
      external_id: 'manager',
      email: 'manager@example.test',
      display_name: 'Survey manager',
      role_level: 'admin',
    },
    workspace_id: WORKSPACE_ID,
  });
  const history = createMemoryHistory({
    initialEntries: [
      `/surveys/${SURVEY_ID}?managedSystem=${SYSTEM_ID}&filter.analytics_area=unset&status=open&follow_up=needed&returnTo=${encodeURIComponent('/home')}`,
    ],
  });
  const router = createRouter({ routeTree, context: { queryClient }, history });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('heading', { name: 'Surveys' })).toBeInTheDocument();
  expect(await screen.findByTestId('survey-create-button')).toBeInTheDocument();
  await waitFor(() =>
    expect(
      requested.some((path) => {
        const url = new URL(path, 'http://localhost');
        return (
          url.pathname === '/surveys' &&
          url.searchParams.get('managed_system_id') === SYSTEM_ID &&
          url.searchParams.get('analytics_area_id') === 'unset' &&
          url.searchParams.get('status') === 'open' &&
          url.searchParams.get('follow_up') === 'needed'
        );
      }),
    ).toBe(true),
  );
  expect(
    screen.getByRole('button', { name: 'Analytics Area: 미지정 필터 제거' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '상태: 진행 중 필터 제거' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '후속 조치 필요 필터 제거' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '상태: 진행 중 필터 제거' }));
  await waitFor(() =>
    expect(router.state.location).toMatchObject({
      pathname: `/surveys/${SURVEY_ID}`,
      search: {
        managedSystem: SYSTEM_ID,
        'filter.analytics_area': 'unset',
        follow_up: 'needed',
        returnTo: '/home',
      },
    }),
  );
  expect(router.state.location.search).not.toHaveProperty('status');

  fireEvent.click(screen.getByTestId(`survey-row-${OTHER_ID}`));
  await waitFor(() => expect(router.state.location.pathname).toBe(`/surveys/${OTHER_ID}`));
  expect(router.state.location.search).toMatchObject({
    managedSystem: SYSTEM_ID,
    'filter.analytics_area': 'unset',
    follow_up: 'needed',
    returnTo: '/home',
  });

  fireEvent.click(await screen.findByRole('button', { name: '패널 닫기' }));
  await waitFor(() => expect(router.state.location.pathname).toBe('/surveys'));
  expect(router.state.location.search).toEqual({
    managedSystem: SYSTEM_ID,
    'filter.analytics_area': 'unset',
    follow_up: 'needed',
  });
});
