import { LinkTaskModal } from '@/features/findings/components/FindingDetail/LinkTaskModal';
import { CoverageRoute } from '@/features/integration/routes/CoverageRoute';
import { IntegrationDashboardRoute } from '@/features/integration/routes/IntegrationDashboardRoute';
import { HomeRoute, validateHomeSearch } from '@/routes/_authed/home';
import {
  IntegrationDashboardRouteShell,
  validateIntegrationDashboardSearch,
} from '@/routes/_authed/integration';
import type { FindingDto } from '@fops/shared';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@fops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import {
  RECOVERY_VISUAL_ID,
  recoveryVisualDetail,
  recoveryVisualHistory,
  recoveryVisualList,
} from '../../../../../tests/visual/fixtures/recovery';

const ID = '11111111-1111-4111-8111-111111111111';
const time = '2026-07-20T08:00:00.000Z';
const finding: FindingDto = {
  id: ID,
  workspace_id: ID,
  display_id: 'FIN-1',
  primary_managed_system_id: ID,
  title: '리포트 오류',
  summary: '개선 필요',
  source_type: 'manual',
  source_id: null,
  owner_actor_id: null,
  owner_team_id: null,
  evidence_count: 0,
  severity: 'high',
  confidence: 'medium',
  status: 'active',
  analytics_area_id: null,
  linked_task_id: null,
  linked_milestone_id: null,
  created_by: ID,
  created_at: time,
  updated_at: time,
  source: null,
};
function DetailPanelSlotHost() {
  const { ref } = useDetailPanelSlotHost();
  return <aside ref={ref} />;
}
function Host() {
  return (
    <DetailPanelSlotProvider>
      <Outlet />
      <DetailPanelSlotHost />
    </DetailPanelSlotProvider>
  );
}
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}
async function mount(url: string, integrationComponent = IntegrationDashboardRoute) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({ component: Host });
  const routes = [
    createRoute({
      getParentRoute: () => root,
      path: '/integration',
      component: integrationComponent,
      validateSearch: validateIntegrationDashboardSearch,
    }),
    createRoute({
      getParentRoute: () => root,
      path: '/home',
      component: HomeRoute,
      validateSearch: validateHomeSearch,
    }),
    createRoute({
      getParentRoute: () => root,
      path: '/integration/coverage',
      component: CoverageRoute,
    }),
    createRoute({
      getParentRoute: () => root,
      path: '/findings',
      validateSearch: (raw) => raw,
      component: () => <LinkTaskModal finding={finding} open onClose={() => {}} />,
    }),
  ];
  const history = createMemoryHistory({ initialEntries: [url] });
  const router = createRouter({ routeTree: root.addChildren(routes), history });
  await act(async () => router.load());
  const rendered = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { client, router, history, ...rendered };
}
function install(blocked = false, role = 'admin') {
  let failed = false;
  let repaired = false;
  const requests: { path: string; body: unknown; method: string }[] = [];
  const detail = () => ({
    ...recoveryVisualDetail(),
    category: 'actionable-finding-no-execution',
    reason_code: 'actionable-finding-no-execution',
    source: {
      type: 'finding',
      id: ID,
      display_id: 'FIN-1',
      title: '리포트 오류',
      route: `/findings?selected=${ID}`,
    },
    next_actions: blocked
      ? [
          {
            ...recoveryVisualDetail().next_actions[0],
            availability: 'blocked_requestable',
            blocked_reason: '권한 요청이 필요합니다.',
            requestable_permission: { permission: 'voc.triage', managed_system_id: ID },
          },
        ]
      : [],
    state: repaired ? 'resolved' : 'active',
    resolution: repaired
      ? {
          resolved_at: time,
          outcome: 'resolved',
          evidence: 'command',
          action: 'link_existing_task',
        }
      : null,
  });
  const listItem = () => {
    const { computed_at: _computed, ...item } = detail();
    return item;
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input, 'http://localhost');
      const path = url.pathname;
      const method = init?.method ?? 'GET';
      requests.push({ path, method, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (method === 'GET' && path === '/me')
        return response({
          actor: { id: ID, role_level: role, display_name: '지원' },
          workspace_id: ID,
        });
      if (method === 'GET' && path === '/dashboard/summary')
        return failed
          ? response({ code: 'internal.unexpected' }, 500)
          : response({
              computed_at: time,
              kpis: { open_voc: repaired ? 0 : 1 },
              action_queues: [
                {
                  id: 'actionable-finding-no-execution',
                  severity: 'warn',
                  count: repaired ? 0 : 1,
                  next_action: {
                    label: 'Finding 실행 연결',
                    route: '/findings',
                    intent: 'plan_execution',
                  },
                  secondary_action: null,
                },
              ],
              coverage: [],
              by_managed_system: [],
            });
      if (method === 'GET' && path === '/dashboard/recovery-items')
        return response({
          ...recoveryVisualList('active'),
          items: repaired ? [] : [listItem()],
          total: repaired ? 0 : 1,
          visible_total: repaired ? 0 : 1,
        });
      if (method === 'GET' && path === '/dashboard/recovery-history')
        return response({
          ...recoveryVisualHistory(),
          items: repaired
            ? [
                {
                  id: ID,
                  item: listItem(),
                  occurrence: 1,
                  resolution: {
                    resolved_at: time,
                    outcome: 'resolved',
                    evidence: 'command',
                    action: 'link_existing_task',
                  },
                },
              ]
            : [],
          total: repaired ? 1 : 0,
        });
      if (method === 'GET' && path === `/dashboard/recovery-items/${RECOVERY_VISUAL_ID}`)
        return response(detail());
      if (method === 'POST' && path === `/findings/${ID}/link-task`) {
        repaired = true;
        return response(finding);
      }
      if (method === 'GET' && path === '/tasks')
        return response({
          items: [
            { id: ID, title: '실행 Task', display_id: 'TASK-1', primary_managed_system_id: ID },
          ],
        });
      if (method === 'GET' && path === '/task-requests') return response({ items: [] });
      if (method === 'GET' && path === '/permission-requests/mine')
        return response({ requests: [] });
      if (method === 'GET' && path === '/notifications')
        return response({ items: [], page: { has_more: false }, unread_count: 0 });
      if (method === 'GET' && path === '/managed-systems') return response({ items: [] });
      if (method === 'GET' && path === '/me/answerable-surveys')
        return response({ items: [], page: { has_more: false } });
      throw new Error(`Unexpected request: ${method} ${path}`);
    }),
  );
  return {
    fail: () => {
      failed = true;
    },
    requests,
  };
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it.each([
  ['/home', 'home-refresh'],
  ['/integration', 'integration-dashboard-refresh'],
  ['/integration/coverage', 'coverage-refresh'],
])('retains last successful server time after failed refresh on %s', async (url, refresh) => {
  const api = install();
  await mount(url);
  await waitFor(() =>
    expect(screen.getAllByTestId('recovery-freshness')[0]).toHaveTextContent(
      '2026-07-20 08:00:00 UTC',
    ),
  );
  api.fail();
  fireEvent.click(screen.getByTestId(refresh));
  await screen.findByText('새로고침 실패 · 마지막 성공한 결과입니다.');
  expect(screen.getAllByTestId('recovery-freshness')[0]).toHaveTextContent(
    '2026-07-20 08:00:00 UTC',
  );
});
it('unregisters Home detail slot on Inbox and restores selected detail on Dashboard and Back', async () => {
  install();
  const { router, history } = await mount(`/home?selected=${RECOVERY_VISUAL_ID}`);
  await screen.findByRole('button', { name: '내 화면에서 1일 숨기기' });
  fireEvent.mouseDown(screen.getByRole('tab', { name: /수신함/ }), { button: 0, ctrlKey: false });
  await waitFor(() => expect(screen.queryByTestId('recovery-panel')).toBeNull());
  expect(router.state.location.search.selected).toBe(RECOVERY_VISUAL_ID);
  await act(async () => history.back());
  await screen.findByRole('button', { name: '내 화면에서 1일 숨기기' });
});
it('repairs in the shipped Finding link workflow then Back refreshes queue, summary, detail and history', async () => {
  const api = install();
  const user = userEvent.setup();
  const { history, client } = await mount(`/integration?selected=${RECOVERY_VISUAL_ID}`);
  await screen.findByRole('link', { name: /FIN-1/ });
  await act(async () => {
    await client.fetchQuery({
      queryKey: ['recovery', 'history', 'before-repair'],
      queryFn: async () => {
        const r = await fetch('/dashboard/recovery-history?limit=50');
        return r.json();
      },
    });
  });
  fireEvent.click(screen.getByRole('link', { name: /FIN-1/ }));
  await user.tab();
  screen.getByRole('combobox').focus();
  await user.keyboard('{ArrowDown}');
  await user.click(await screen.findByRole('option', { name: /TASK-1/ }));
  fireEvent.click(screen.getByTestId('link-task-submit'));
  await waitFor(() =>
    expect(
      api.requests.filter((r) => r.path === `/findings/${ID}/link-task`).map((r) => r.body),
    ).toEqual([{ task_id: ID }]),
  );
  await waitFor(() =>
    expect(client.getQueryState(['recovery', 'history', 'before-repair'])?.isInvalidated).toBe(
      true,
    ),
  );
  await act(async () => history.back());
  await screen.findByText('해결됨');
  await screen.findByText('현재 표시할 항목이 없습니다.');
  expect(screen.queryByRole('button', { name: '내 화면에서 1일 숨기기' })).toBeNull();
  fireEvent.mouseDown(
    within(screen.getByTestId('recovery-queue')).getByRole('tab', { name: '최근 처리 이력' }),
    { button: 0, ctrlKey: false },
  );
  await screen.findByText('1회차 · 해결됨');
});

it.each(['/home', '/integration'])(
  'injects the request-access control from the %s route',
  async (path) => {
    const api = install(true);
    await mount(`${path}?selected=${RECOVERY_VISUAL_ID}`, IntegrationDashboardRouteShell);
    await screen.findByText('권한 요청이 필요합니다.');
    fireEvent.click(screen.getByRole('button', { name: '권한 요청' }));
    await screen.findByTestId('permission-request-dialog');
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.requests.filter((request) => request.method !== 'GET')).toEqual([]);
  },
);
it('shows the authorized scoped Developer queue total', async () => {
  install(false, 'developer');
  await mount(`/integration?managedSystem=${ID}`);
  await waitFor(() =>
    expect(screen.getByTestId('integration-dashboard-gap-count')).toHaveTextContent('1'),
  );
});
it('shows one freshness line when page, queue and detail have the same computation time', async () => {
  install();
  await mount(`/integration?selected=${RECOVERY_VISUAL_ID}`);
  await screen.findByRole('button', { name: '내 화면에서 1일 숨기기' });
  expect(screen.getAllByTestId('recovery-freshness')).toHaveLength(1);
  expect(screen.queryByText('목록, 상세, 요약은 각각 계산됩니다.')).toBeNull();
});
