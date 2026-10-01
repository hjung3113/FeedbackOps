import { DASHBOARD_HOP_ROUTES, dashboardSummarySchema } from '@fops/shared';
import type { DashboardCoverageId } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { COVERAGE_METRIC_IDS, COVERAGE_METRIC_LABELS } from '@/lib/copy/coverage';
import { AppSidebar } from '@/lib/layout/AppSidebar';
import { HomeRoute } from '@/routes/_authed/home';
import { HomeScreen } from '../HomeScreen';
import { homeSidebarEntries } from '../homeNavigation';

const response = {
  kpis: { open_voc: 1 },
  action_queues: [
    {
      id: 'unassigned-voc',
      severity: 'urgent',
      count: 0,
      next_action: { label: 'Review', route: '/vocs?view=triage', intent: 'review' },
      secondary_action: null,
    },
    {
      id: 'actionable-finding-no-execution',
      severity: 'warn',
      count: 2,
      next_action: { label: 'Request', route: '/findings', intent: 'request' },
      secondary_action: null,
    },
    {
      id: 'permission-requests-pending',
      severity: 'info',
      count: 1,
      next_action: { label: 'Open', route: '/admin/permissions/requests', intent: 'review' },
      secondary_action: null,
    },
  ],
  coverage: [],
  by_managed_system: [],
};

function installFetch(
  summary: unknown = response,
  options: {
    pendingSummary?: boolean;
    unreadCount?: number;
    failUnreadCountAfterFirst?: boolean;
  } = {},
): ReturnType<typeof vi.fn> {
  let unreadCountRequests = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/me'))
      return new Response(
        JSON.stringify({
          actor: {
            id: '11111111-1111-4111-8111-111111111111',
            external_id: 'actor',
            email: 'actor@example.test',
            display_name: '지원',
            role_level: 'admin',
          },
          workspace_id: '22222222-2222-4222-8222-222222222222',
        }),
        { status: 200 },
      );
    if (url.startsWith('/dashboard/summary')) {
      if (options.pendingSummary) return new Promise<Response>(() => {});
      return new Response(JSON.stringify(summary), { status: 200 });
    }
    if (url.startsWith('/tasks') || url.startsWith('/task-requests'))
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    if (url.startsWith('/permission-requests/mine'))
      return new Response(JSON.stringify({ requests: [] }), { status: 200 });
    if (url.startsWith('/notifications')) {
      const notificationUrl = new URL(url, 'http://localhost');
      if (notificationUrl.searchParams.has('limit')) {
        unreadCountRequests += 1;
        if (options.failUnreadCountAfterFirst && unreadCountRequests > 1) {
          return new Response(
            JSON.stringify({ code: 'internal.unexpected', message: 'temporary failure' }),
            { status: 500 },
          );
        }
      }
      return new Response(
        JSON.stringify({
          items: [],
          page: { has_more: false },
          unread_count: options.unreadCount ?? 0,
        }),
        { status: 200 },
      );
    }
    return new Response('not mocked', { status: 500 });
  });
  globalThis.fetch = fetchMock as typeof globalThis.fetch;
  return fetchMock;
}

function buildHarness(initialPath: string) {
  const root = createRootRoute({ component: () => <Outlet /> });
  const home = createRoute({ getParentRoute: () => root, path: '/home', component: HomeRoute });
  return createRouter({
    routeTree: root.addChildren([home]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
}

function renderHome(initialPath = '/home') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = buildHarness(initialPath);
  const rendered = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...rendered, router, queryClient: client };
}

function ScopeHarness(): React.ReactElement {
  const [managedSystemId, setManagedSystemId] = React.useState<string | undefined>();
  return (
    <>
      <AppSidebar
        entries={homeSidebarEntries(undefined, true)}
        managedSystems={[
          { id: '33333333-3333-4333-8333-333333333333', name: 'Finance', granted: true },
        ]}
        onManagedSystemChange={setManagedSystemId}
      />
      <HomeScreen {...(managedSystemId !== undefined ? { managedSystemId } : {})} />
    </>
  );
}

describe('HomeScreen route content', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('keeps zero queues in the compact strip and omits absent queue cards', async () => {
    installFetch();
    renderHome();
    await waitFor(() =>
      expect(screen.getByTestId('home-zero-queue-unassigned-voc')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('home-queue-unassigned-voc')).toBeNull();
    expect(screen.getByRole('link', { name: '미배정 VOC 0' })).toHaveAttribute(
      'href',
      '/vocs?view=triage',
    );
    expect(
      screen.getByText(
        '오늘 워크스페이스에 3개의 운영 갭이 있습니다. 우선순위가 높은 큐부터 확인하세요.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('home-queue-high-severity-unlinked')).toBeNull();
  });

  it('keeps an urgent zero Home sidebar queue badge neutral', () => {
    const summary = dashboardSummarySchema.parse({
      ...response,
      action_queues: [
        {
          id: 'bad-outcome-no-followup',
          severity: 'urgent',
          count: 0,
          next_action: { label: 'Review', route: '/surveys', intent: 'review' },
          secondary_action: null,
        },
      ],
    });

    render(<AppSidebar entries={homeSidebarEntries(summary, true)} />);

    const badge = screen.getByTestId('sidebar-count-queue-bad-outcome-no-followup');
    expect(badge).toHaveTextContent('0');
    expect(badge.className).toContain('bg-surface-row-selected');
    expect(badge.className).not.toContain('text-accent-danger');
  });

  it('renders only the zero queue strip when every queue count is zero', async () => {
    const allZero = dashboardSummarySchema.parse({
      ...response,
      action_queues: response.action_queues.map((queue) => ({ ...queue, count: 0 })),
    });
    installFetch(allZero);
    renderHome();

    await screen.findByTestId('home-zero-queue-unassigned-voc');
    expect(screen.queryByRole('heading', { name: '복구 · 후속 조치 큐' })).toBeNull();
    expect(screen.queryByTestId('home-action-queues')).toBeNull();
    expect(screen.getByTestId('home-zero-queues')).toHaveTextContent('처리할 항목 없음');
    expect(screen.getAllByRole('link', { name: / 0$/ })).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /Review|Request|Open/ })).toBeNull();
    expect(screen.getByText('현재 확인할 운영 큐가 없습니다.')).toBeInTheDocument();
  });

  it('omits queue and Coverage sections while the summary is loading', async () => {
    const fetchMock = installFetch(response, { pendingSummary: true });
    renderHome();

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input]) => String(input).startsWith('/dashboard/summary')),
      ).toBe(true),
    );
    expect(screen.queryByRole('heading', { name: '복구 · 후속 조치 큐' })).toBeNull();
    expect(screen.queryByTestId('home-action-queues')).toBeNull();
    expect(screen.queryByRole('heading', { name: '커버리지 신호' })).toBeNull();
    expect(screen.queryByTestId('home-coverage')).toBeNull();
  });

  it('omits the recovery queue section when action_queues is empty', async () => {
    const noQueues = dashboardSummarySchema.parse({
      ...response,
      action_queues: [],
      coverage: [{ id: 'voc-task', value: 1, total: 2, percent: 50, status: 'warn' }],
    });
    installFetch(noQueues);
    renderHome();

    await screen.findByTestId('home-kpi-open_voc');
    expect(screen.queryByRole('heading', { name: '복구 · 후속 조치 큐' })).toBeNull();
    expect(screen.queryByTestId('home-action-queues')).toBeNull();
    expect(screen.getByRole('heading', { name: '커버리지 신호' })).toBeInTheDocument();
  });

  it('omits the Coverage section when coverage is empty', async () => {
    installFetch(dashboardSummarySchema.parse({ ...response, coverage: [] }));
    renderHome();

    await screen.findByTestId('home-kpi-open_voc');
    expect(screen.queryByRole('heading', { name: '커버리지 신호' })).toBeNull();
    expect(screen.queryByTestId('home-coverage')).toBeNull();
  });

  it('explains the scoped Home view when both queues and coverage are empty', async () => {
    installFetch(dashboardSummarySchema.parse({ ...response, action_queues: [], coverage: [] }));
    renderHome();

    await screen.findByText(
      '운영 큐와 커버리지는 Managed System 담당 범위가 있을 때만 표시됩니다. 지금은 나에게 배정된 작업만 보입니다.',
    );
    expect(screen.queryByRole('heading', { name: '복구 · 후속 조치 큐' })).toBeNull();
    expect(screen.queryByTestId('home-action-queues')).toBeNull();
    expect(screen.queryByRole('heading', { name: '커버리지 신호' })).toBeNull();
    expect(screen.queryByTestId('home-coverage')).toBeNull();
  });

  it('links coverage rows to the shared one-hop routes', async () => {
    const coverage = [
      { id: 'voc-task', value: 2, total: 3, percent: 67, status: 'warn' },
      { id: 'finding-execution', value: 1, total: 2, percent: 50, status: 'warn' },
      { id: 'high-followup', value: 0, total: 1, percent: 0, status: 'bad' },
      { id: 'released-update', value: 3, total: 4, percent: 75, status: 'good' },
      { id: 'analytics-area', value: 1, total: 3, percent: 33, status: 'bad' },
      { id: 'milestone-outcome', value: 0, total: 2, percent: 0, status: 'bad' },
    ] as const;
    installFetch(dashboardSummarySchema.parse({ ...response, coverage }));
    renderHome();

    await screen.findByTestId('home-coverage-row-voc-task');
    expect(screen.getByRole('link', { name: /커버리지 보기/ })).toHaveAttribute(
      'href',
      '/integration/coverage',
    );

    for (const item of coverage) {
      const row = screen.getByTestId(`home-coverage-row-${item.id}`);
      if (item.id === 'milestone-outcome') {
        expect(row.tagName).not.toBe('A');
        continue;
      }
      expect({ tagName: row.tagName, href: row.getAttribute('href') }).toEqual({
        tagName: 'A',
        href: DASHBOARD_HOP_ROUTES[item.id],
      });
    }
  });

  it.each(COVERAGE_METRIC_IDS)('renders the shared Home coverage label for %s', async (id) => {
    const metric = {
      id,
      value: 1,
      total: 2,
      percent: 50,
      status: 'warn' as const,
    };
    installFetch(dashboardSummarySchema.parse({ ...response, coverage: [metric] }));
    renderHome();

    const row = await screen.findByTestId(`home-coverage-row-${id}`);
    expect(row).toHaveTextContent(COVERAGE_METRIC_LABELS[id as DashboardCoverageId]);
  });

  it('labels the Home coverage KPI with the VOC-to-Task metric', async () => {
    const summary = dashboardSummarySchema.parse({
      ...response,
      kpis: { open_voc: 1, coverage_percent: 18 },
    });
    installFetch(summary);
    renderHome();

    const pill = await screen.findByTestId('home-kpi-coverage_percent');
    expect(pill).toHaveTextContent(COVERAGE_METRIC_LABELS['voc-task']);
  });

  it('keeps the selected managed system on coverage hops', async () => {
    const systemId = '33333333-3333-4333-8333-333333333333';
    const coverage = [
      { id: 'voc-task', value: 2, total: 3, percent: 67, status: 'warn' },
      { id: 'finding-execution', value: 1, total: 2, percent: 50, status: 'warn' },
      { id: 'high-followup', value: 0, total: 1, percent: 0, status: 'bad' },
      { id: 'released-update', value: 3, total: 4, percent: 75, status: 'good' },
      { id: 'analytics-area', value: 1, total: 3, percent: 33, status: 'bad' },
      { id: 'milestone-outcome', value: 0, total: 2, percent: 0, status: 'bad' },
    ] as const;
    installFetch(dashboardSummarySchema.parse({ ...response, coverage }));
    renderHome(`/home?managedSystem=${systemId}`);

    await screen.findByTestId('home-coverage-row-voc-task');
    expect(screen.getByRole('link', { name: /커버리지 보기/ })).toHaveAttribute(
      'href',
      '/integration/coverage',
    );
    for (const item of coverage) {
      const row = screen.getByTestId(`home-coverage-row-${item.id}`);
      if (item.id === 'milestone-outcome') {
        expect(row.tagName).not.toBe('A');
        continue;
      }
      const href = row.getAttribute('href');
      expect(href).toEqual(expect.any(String));
      const url = new URL(href ?? '', 'http://localhost');
      expect(url.searchParams.get('managedSystem')).toBe(systemId);
      url.searchParams.delete('managedSystem');
      const rest = url.searchParams.toString();
      expect(`${url.pathname}?${rest}`).toBe(DASHBOARD_HOP_ROUTES[item.id]);
    }
  });

  it('renders a present zero queue in the sidebar', () => {
    render(
      <AppSidebar entries={homeSidebarEntries(dashboardSummarySchema.parse(response), true)} />,
    );
    expect(screen.getByTestId('sidebar-count-queue-unassigned-voc')).toHaveTextContent('0');
    expect(screen.getByText('구성된 후속 조치')).toBeInTheDocument();
  });

  it('omits permission-hidden queue ids from the sidebar', () => {
    const absent = dashboardSummarySchema.parse({
      ...response,
      action_queues: response.action_queues.filter(
        (queue) => queue.id !== 'permission-requests-pending',
      ),
    });
    render(<AppSidebar entries={homeSidebarEntries(absent, true)} />);
    expect(screen.queryByTestId('sidebar-nav-queue-permission-requests-pending')).toBeNull();
    expect(screen.queryByTestId('sidebar-count-queue-permission-requests-pending')).toBeNull();
  });

  it.each([
    { name: 'without queue data', summary: undefined },
    { name: 'with queue data', summary: dashboardSummarySchema.parse(response) },
  ])('omits prototype navigation placeholders $name', ({ summary }) => {
    render(<AppSidebar entries={homeSidebarEntries(summary, true)} />);

    const sidebar = within(screen.getByTestId('app-sidebar'));
    expect(sidebar.queryByText('Command')).not.toBeInTheDocument();
    expect(sidebar.queryByText('⌘K')).not.toBeInTheDocument();
    expect(sidebar.queryByText('RECENT')).not.toBeInTheDocument();
    expect(sidebar.queryByText('FIN-181 SSO 재인증')).not.toBeInTheDocument();
    expect(sidebar.queryByText('VOC-2814 사이드 메뉴')).not.toBeInTheDocument();
    expect(sidebar.queryByText('TASK-901 쿼리 플랜')).not.toBeInTheDocument();
  });

  it('maps urgent, warn, and info queues to their semantic color classes', async () => {
    const summary = dashboardSummarySchema.parse({
      ...response,
      action_queues: response.action_queues.map((queue) =>
        queue.id === 'unassigned-voc' ? { ...queue, count: 1 } : queue,
      ),
    });
    installFetch(summary);
    renderHome();
    await waitFor(() =>
      expect(screen.getByTestId('home-queue-unassigned-voc')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('home-queue-count-unassigned-voc')).toHaveClass('text-accent-danger');
    expect(screen.getByTestId('home-queue-count-actionable-finding-no-execution')).toHaveClass(
      'text-accent-warn',
    );
    expect(screen.getByTestId('home-queue-count-permission-requests-pending')).toHaveClass(
      'text-accent-info',
    );
  });

  it('keeps the secondary queue link before the primary link in keyboard order', async () => {
    const summary = dashboardSummarySchema.parse({
      ...response,
      action_queues: response.action_queues.map((queue) =>
        queue.id === 'unassigned-voc'
          ? {
              ...queue,
              count: 1,
              secondary_action: {
                label: 'Bulk assign',
                route: '/vocs?view=inbox&tab=unassigned',
                intent: 'bulk_assign',
              },
            }
          : queue,
      ),
    });
    installFetch(summary);
    renderHome();

    const card = await screen.findByTestId('home-queue-unassigned-voc');
    expect(
      within(card)
        .getAllByRole('link')
        .map((link) => link.textContent?.trim()),
    ).toEqual(['일괄 배정', 'VOC 검토']);
  });

  it('refetches the strict summary when the scope selector changes', async () => {
    const fetchMock = installFetch();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ScopeHarness />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByTestId('scope-selector'));
    fireEvent.click(screen.getByTestId('scope-option-33333333-3333-4333-8333-333333333333'));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/dashboard/summary?managed_system_id=33333333-3333-4333-8333-333333333333',
        expect.anything(),
      ),
    );
  });

  it('renders each open permission request capability', async () => {
    installFetch().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/me'))
        return new Response(
          JSON.stringify({
            actor: {
              id: '11111111-1111-4111-8111-111111111111',
              external_id: 'actor',
              email: 'actor@example.test',
              display_name: '지원',
              role_level: 'admin',
            },
            workspace_id: '22222222-2222-4222-8222-222222222222',
          }),
          { status: 200 },
        );
      if (url.startsWith('/dashboard/summary'))
        return new Response(JSON.stringify(response), { status: 200 });
      if (url.startsWith('/tasks') || url.startsWith('/task-requests'))
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      if (url.startsWith('/permission-requests/mine'))
        return new Response(
          JSON.stringify({
            requests: [
              {
                id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                requested_capability: 'workspace.admin',
                requested_managed_system_id: null,
                reason: 'Need admin',
                requested_object_type: null,
                requested_object_id: null,
                source_object_type: null,
                source_object_id: null,
                source_action_id: null,
                status: 'pending',
                created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
              },
              {
                id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                requested_capability: 'finding.manage',
                requested_managed_system_id: null,
                reason: 'Need write',
                requested_object_type: null,
                requested_object_id: null,
                source_object_type: null,
                source_object_id: null,
                source_action_id: null,
                status: 'needs_more_info',
                created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
              },
            ],
          }),
          { status: 200 },
        );
      return new Response('not mocked', { status: 500 });
    });
    renderHome();
    await screen.findByTestId('home-open-requests-list');
    const requests = within(screen.getByTestId('home-open-requests-list'));
    expect(requests.getByText('워크스페이스 관리자 권한')).toBeInTheDocument();
    expect(requests.getByText('Finding 관리')).toBeInTheDocument();
    expect(requests.queryByText('workspace.admin')).not.toBeInTheDocument();
    expect(requests.queryByText(/id:/i)).not.toBeInTheDocument();
    expect(requests.queryByText('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).not.toBeInTheDocument();
    expect(requests.queryByText('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')).not.toBeInTheDocument();
    expect(requests.getByText(/대기 중 ·/)).toBeInTheDocument();
    expect(requests.getByText(/추가 정보 필요 ·/)).toBeInTheDocument();
    expect(requests.getByText(/대기 중 · 3시간 전/)).toBeInTheDocument();
    expect(requests.queryByText(/pending ·/)).not.toBeInTheDocument();
    expect(requests.queryByText(/needs_more_info ·/)).not.toBeInTheDocument();
  });

  it('renders the empty state without the request list after the query resolves', async () => {
    installFetch();
    renderHome();
    await screen.findByText('열린 요청이 없습니다.');
    expect(screen.queryByTestId('home-open-requests-list')).not.toBeInTheDocument();
  });

  // #280 removed the *promise* of a My Work screen, not the live rows beneath
  // it. The panel queries assigned Tasks and pending Task Requests and both
  // render — only the dead sidebar entry and the disabled "Open My Work" link
  // are gone. Asserting the panel is still populated is what keeps a future
  // cleanup from deleting working data again.
  it('AC-E3a drops the dead My Work entry point but keeps the live panel', async () => {
    installFetch();
    renderHome();

    const panel = await screen.findByTestId('home-my-work');
    expect(panel).toBeInTheDocument();
    expect(screen.getByText('내게 배정됨')).toBeInTheDocument();
    expect(screen.queryByText('Open My Work')).not.toBeInTheDocument();
    expect(screen.queryByText('My work')).not.toBeInTheDocument();

    render(<AppSidebar entries={homeSidebarEntries(undefined, true)} />);
    expect(screen.getByTestId('sidebar-nav-home')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-nav-my-work')).not.toBeInTheDocument();
  });

  it('AC-E3b keeps the assigned Task and pending Request rows linking to real routes', async () => {
    // The shared installFetch() returns empty lists, which would render the
    // "nothing assigned" copy and leave this assertion nothing to beat. Seed
    // one of each so the rows actually exist.
    const base = installFetch();
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('/tasks'))
        return new Response(
          JSON.stringify({
            items: [
              { id: 'task-a1', display_id: 'TSK-701', title: '쿼리 플랜 개선', status: 'doing' },
            ],
          }),
          { status: 200 },
        );
      if (url.startsWith('/task-requests'))
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'req-b2',
                display_id: 'REQ-902',
                requested_outcome: '재인증 흐름 개선',
                status: 'pending_review',
              },
            ],
          }),
          { status: 200 },
        );
      return base(input, init);
    }) as typeof globalThis.fetch;
    renderHome();

    const panel = await screen.findByTestId('home-my-work');
    await within(panel).findByText('TSK-701 — 쿼리 플랜 개선');
    expect(within(panel).getByText('REQ-902 — 재인증 흐름 개선')).toBeInTheDocument();
    const links = within(panel).getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', '/tasks?view=board&param=task-a1');
    expect(links[1]).toHaveAttribute('href', '/tasks?view=requests&param=req-b2');
  });

  it('restores the Inbox tab from /home?tab=inbox', async () => {
    installFetch(response, { unreadCount: 3 });
    renderHome('/home?tab=inbox');

    await screen.findByTestId('home-inbox-list');
    expect(screen.getByRole('tab', { name: /^수신함/ })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(screen.getByRole('tab', { name: /^수신함/ })).toHaveTextContent('3'));
  });

  it('caps the Inbox tab badge and hides it after its count refetch fails', async () => {
    const fetchMock = installFetch(response, {
      unreadCount: 120,
      failUnreadCountAfterFirst: true,
    });
    const { queryClient } = renderHome();
    const inboxTab = await screen.findByRole('tab', { name: /^수신함/ });

    await waitFor(() => expect(inboxTab).toHaveTextContent('99+'));
    expect(inboxTab).not.toHaveTextContent('120');

    await queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });

    await waitFor(() => expect(inboxTab).not.toHaveTextContent('99+'));
    expect(inboxTab).not.toHaveTextContent('120');
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).startsWith('/notifications?unread=true&limit=1'),
      ),
    ).toHaveLength(2);
  });

  it('switches Home tabs while retaining managedSystem and removes tab for Dashboard', async () => {
    const managedSystemId = '33333333-3333-4333-8333-333333333333';
    installFetch(response, { unreadCount: 4 });
    const { router } = renderHome(`/home?managedSystem=${managedSystemId}`);

    fireEvent.mouseDown(await screen.findByRole('tab', { name: /^수신함/ }));
    await screen.findByTestId('home-inbox-list');
    await waitFor(() =>
      expect(router.state.location.search).toEqual({
        managedSystem: managedSystemId,
        tab: 'inbox',
      }),
    );
    expect(screen.getByRole('tab', { name: /^수신함/ })).toHaveTextContent('4');

    fireEvent.mouseDown(await screen.findByRole('tab', { name: /^대시보드/ }));
    await screen.findByTestId('home-kpis');
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ managedSystem: managedSystemId }),
    );
    expect(screen.getByTestId('home-action-queues')).toBeInTheDocument();
  });
});
