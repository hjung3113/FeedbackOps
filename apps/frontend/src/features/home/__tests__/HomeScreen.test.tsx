import { PermissionGate } from '@/features/admin/permissions/permission-gate';
import { ownerDetailFixture } from '@/test/permission-details';
import {
  DASHBOARD_ACTIONABLE_FINDINGS_ROUTE,
  DASHBOARD_HOP_ROUTES,
  DASHBOARD_UNASSIGNED_VOC_ROUTE,
  dashboardSummarySchema,
} from '@fops/shared';
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
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

import { COVERAGE_METRIC_IDS, COVERAGE_METRIC_LABELS } from '@/lib/copy/coverage';
import { HOME_QUEUE_COPY } from '@/lib/copy/home';
import { AppSidebar } from '@/lib/layout/AppSidebar';
import { HomeRoute } from '@/routes/_authed/home';
import { HomeScreen } from '../HomeScreen';
import { homeSidebarEntries } from '../homeNavigation';

const response = {
  computed_at: '2026-10-13T00:00:00.000Z',
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
    roleLevel?: string;
    taskItems?: unknown[];
    taskRequestItems?: unknown[];
    answerableSurveys?: unknown;
    personalWorkStatus?: number;
    summaryStatus?: number;
    permissionRequests?: unknown[];
  } = {},
): ReturnType<typeof vi.fn> {
  let unreadCountRequests = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/me/answerable-surveys'))
      return new Response(
        JSON.stringify(options.answerableSurveys ?? { items: [], page: { has_more: false } }),
        { status: 200 },
      );
    if (url === '/me')
      return new Response(
        JSON.stringify({
          actor: {
            id: '11111111-1111-4111-8111-111111111111',
            external_id: 'actor',
            email: 'actor@example.test',
            display_name: '지원',
            role_level: options.roleLevel ?? 'admin',
          },
          workspace_id: '22222222-2222-4222-8222-222222222222',
        }),
        { status: 200 },
      );
    if (url.startsWith('/dashboard/summary')) {
      if (options.pendingSummary) return new Promise<Response>(() => {});
      if (options.summaryStatus !== undefined)
        return new Response(JSON.stringify({ code: 'internal.unexpected', message: 'x' }), {
          status: options.summaryStatus,
        });
      return new Response(JSON.stringify(summary), { status: 200 });
    }
    if (
      options.personalWorkStatus !== undefined &&
      (url.startsWith('/tasks') || url.startsWith('/task-requests'))
    )
      return new Response(
        JSON.stringify(
          options.personalWorkStatus === 403
            ? { code: 'permission.denied', message: 'finding.manage capability required' }
            : { code: 'internal.unexpected', message: 'x' },
        ),
        { status: options.personalWorkStatus },
      );
    if (url.startsWith('/tasks'))
      return new Response(JSON.stringify({ items: options.taskItems ?? [] }), { status: 200 });
    if (url.startsWith('/task-requests'))
      return new Response(JSON.stringify({ items: options.taskRequestItems ?? [] }), {
        status: 200,
      });
    if (url.startsWith('/permission-requests/mine'))
      return new Response(JSON.stringify({ requests: options.permissionRequests ?? [] }), {
        status: 200,
      });
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
    toast.success.mockReset();
    toast.error.mockReset();
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
      screen.getByText('오늘 확인할 운영 큐가 있습니다. 우선순위가 높은 큐부터 확인하세요.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/\d+개의 운영 갭/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('home-queue-high-severity-unlinked')).toBeNull();
  });

  it('keeps a positive urgent Home sidebar queue badge neutral', () => {
    const summary = dashboardSummarySchema.parse({
      ...response,
      action_queues: [
        {
          id: 'bad-outcome-no-followup',
          severity: 'urgent',
          count: 3,
          next_action: { label: 'Review', route: '/surveys', intent: 'review' },
          secondary_action: null,
        },
      ],
    });

    render(<AppSidebar entries={homeSidebarEntries(summary, true)} />);

    const badge = screen.getByTestId('sidebar-count-queue-bad-outcome-no-followup');
    expect(badge).toHaveTextContent('3');
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

  it('renders total-zero coverage as the neutral no_data state', async () => {
    const coverage = [
      { id: 'voc-task', value: 0, total: 0, percent: 0, status: 'no_data' },
      { id: 'finding-execution', value: 1, total: 2, percent: 50, status: 'warn' },
    ] as const;
    installFetch(dashboardSummarySchema.parse({ ...response, coverage }));
    renderHome();

    // ADR-0067 56-1/O2: an empty denominator is neutral absence of work, not a
    // green 0/0 · 0%; measured metrics keep their ratio presentation.
    const row = await screen.findByTestId('home-coverage-row-voc-task');
    expect(row.textContent).toContain('집계 대상 없음');
    expect(row.textContent).not.toContain('0 / 0');
    expect(row.textContent).not.toContain('0%');
    const measured = screen.getByTestId('home-coverage-row-finding-execution');
    expect(measured.textContent).toContain('1 / 2 · 50%');
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

  it('shows VOC-to-Task coverage only in CoveragePanel, not as a Home stat pill', async () => {
    const summary = dashboardSummarySchema.parse({
      ...response,
      kpis: { open_voc: 1, coverage_percent: 18 },
      coverage: [{ id: 'voc-task', value: 180, total: 1000, percent: 18, status: 'bad' }],
    });
    installFetch(summary);
    renderHome();

    await screen.findByTestId('home-coverage-row-voc-task');
    expect(screen.queryByTestId('home-kpi-coverage_percent')).not.toBeInTheDocument();
    expect(screen.getByTestId('home-coverage')).toBeInTheDocument();
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

  it('keeps the selected managed system on queue card and zero-chip links (#1179)', async () => {
    const systemId = '33333333-3333-4333-8333-333333333333';
    const summary = dashboardSummarySchema.parse({
      ...response,
      action_queues: [
        {
          id: 'actionable-finding-no-execution',
          severity: 'warn',
          count: 2,
          next_action: {
            label: 'Request',
            route: DASHBOARD_ACTIONABLE_FINDINGS_ROUTE,
            intent: 'review',
          },
          secondary_action: null,
        },
        {
          id: 'unassigned-voc',
          severity: 'urgent',
          count: 0,
          next_action: { label: 'Review', route: DASHBOARD_UNASSIGNED_VOC_ROUTE, intent: 'review' },
          secondary_action: null,
        },
      ],
    });
    installFetch(summary);
    renderHome(`/home?managedSystem=${systemId}`);

    await screen.findByTestId('home-queue-actionable-finding-no-execution');
    expect(screen.getByRole('link', { name: /Finding 검토/ })).toHaveAttribute(
      'href',
      `${DASHBOARD_ACTIONABLE_FINDINGS_ROUTE}&managedSystem=${systemId}`,
    );
    expect(screen.getByTestId('home-zero-queue-unassigned-voc')).toHaveAttribute(
      'href',
      `${DASHBOARD_UNASSIGNED_VOC_ROUTE}&managedSystem=${systemId}`,
    );
  });

  it('keeps queue card and zero-chip links bare without a selected managed system (#1179)', async () => {
    const summary = dashboardSummarySchema.parse({
      ...response,
      action_queues: [
        {
          id: 'actionable-finding-no-execution',
          severity: 'warn',
          count: 2,
          next_action: {
            label: 'Request',
            route: DASHBOARD_ACTIONABLE_FINDINGS_ROUTE,
            intent: 'review',
          },
          secondary_action: null,
        },
        {
          id: 'unassigned-voc',
          severity: 'urgent',
          count: 0,
          next_action: { label: 'Review', route: DASHBOARD_UNASSIGNED_VOC_ROUTE, intent: 'review' },
          secondary_action: null,
        },
      ],
    });
    installFetch(summary);
    renderHome('/home');

    await screen.findByTestId('home-queue-actionable-finding-no-execution');
    expect(screen.getByRole('link', { name: /Finding 검토/ })).toHaveAttribute(
      'href',
      DASHBOARD_ACTIONABLE_FINDINGS_ROUTE,
    );
    expect(screen.getByTestId('home-zero-queue-unassigned-voc')).toHaveAttribute(
      'href',
      DASHBOARD_UNASSIGNED_VOC_ROUTE,
    );
  });

  it.each([
    'unassigned-voc',
    'high-severity-unlinked',
    'actionable-finding-no-execution',
    'released-task-unresolved-voc',
    'bad-outcome-no-followup',
    'permission-requests-pending',
  ] as const)('sidebar label equals the card title for %s (#1179)', (id) => {
    const summary = dashboardSummarySchema.parse({
      ...response,
      action_queues: [
        {
          id,
          severity: 'warn',
          count: 1,
          next_action: { label: 'Review', route: '/findings', intent: 'review' },
          secondary_action: null,
        },
      ],
    });
    const entries = homeSidebarEntries(summary, true);
    expect(entries.find((entry) => entry.id === `queue-${id}`)?.label).toBe(
      HOME_QUEUE_COPY[id].title,
    );
  });

  it('renders a present zero queue in the sidebar', () => {
    render(
      <AppSidebar entries={homeSidebarEntries(dashboardSummarySchema.parse(response), true)} />,
    );
    expect(screen.getByTestId('sidebar-count-queue-unassigned-voc')).toHaveTextContent('0');
    // #1179: the sidebar reuses the card title as the one queue name.
    expect(screen.getByText('실행 계획 없는 Finding')).toBeInTheDocument();
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
    const openCommandPalette = vi.fn();
    render(<AppSidebar entries={homeSidebarEntries(summary, true, openCommandPalette)} />);

    const sidebar = within(screen.getByTestId('app-sidebar'));
    // #611 restored the Command row as a real action (sidebar-nav-command);
    // RECENT and the prototype's sample queue rows stay placeholders.
    const commandRow = sidebar.getByTestId('sidebar-nav-command');
    expect(commandRow).toBeInTheDocument();
    fireEvent.click(commandRow);
    expect(openCommandPalette).toHaveBeenCalledOnce();
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
    ).toEqual(['미배정 VOC 보기', 'VOC 검토']);
    expect(within(card).getByRole('link', { name: '미배정 VOC 보기' })).toHaveAttribute(
      'href',
      '/vocs?view=inbox&tab=unassigned',
    );
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
                revision: 7,
                requested_expiration: null,
                updated_at: '2026-10-13T00:00:00.000Z',
                return_route_intent: '/home',
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
                revision: 7,
                requested_expiration: null,
                updated_at: '2026-10-13T00:00:00.000Z',
                return_route_intent: '/home',
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
    expect(requests.getByText('대기 중')).toBeInTheDocument();
    expect(requests.getByText('추가 정보 필요')).toBeInTheDocument();
    expect(requests.getAllByText('3시간 전')).toHaveLength(2);
    expect(requests.queryByText(/pending ·/)).not.toBeInTheDocument();
    expect(requests.queryByText(/needs_more_info ·/)).not.toBeInTheDocument();
  });

  it.each(['pending', 'needs_more_info'] as const)(
    'updates the same %s request with latest question and explicit expiration clear',
    async (status) => {
      const detail = ownerDetailFixture(status);
      const base = installFetch();
      const writes: Array<{ url: string; body: unknown }> = [];
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === '/permission-requests/mine')
          return new Response(JSON.stringify({ requests: [detail] }));
        if (url === `/permission-requests/${detail.id}` && init?.method !== 'PATCH')
          return new Response(JSON.stringify(detail));
        if (init?.method === 'PATCH' || url.endsWith('/submit-more-info')) {
          writes.push({ url, body: JSON.parse(init?.body as string) });
          return new Response(
            JSON.stringify({
              id: detail.id,
              revision: 8,
              status: 'pending',
              updated_at: detail.updated_at,
            }),
          );
        }
        return base(input, init);
      }) as typeof fetch;
      renderHome();
      fireEvent.click(await screen.findByRole('button', { name: /Finding 관리/ }));
      const dialog = await screen.findByTestId('owner-permission-request-dialog');
      await within(dialog).findByDisplayValue('original reason');
      if (status === 'needs_more_info')
        expect(within(dialog).getByText('최신 질문입니다')).toBeInTheDocument();
      fireEvent.change(within(dialog).getByLabelText('사유'), {
        target: { value: '  updated reason  ' },
      });
      fireEvent.click(within(dialog).getByRole('radio', { name: '만료 없음' }));
      fireEvent.click(
        within(dialog).getByRole('button', { name: status === 'pending' ? '수정' : '보완 제출' }),
      );
      await waitFor(() =>
        expect(writes).toEqual([
          {
            url: `/permission-requests/${detail.id}${status === 'pending' ? '' : '/submit-more-info'}`,
            body: { expected_revision: 7, reason: 'updated reason', requested_expiration: null },
          },
        ]),
      );
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith(
          status === 'pending' ? '요청이 수정되었습니다.' : '보완 답변이 제출되었습니다.',
        ),
      );
      await waitFor(() =>
        expect(screen.queryByTestId('owner-permission-request-dialog')).not.toBeInTheDocument(),
      );
    },
  );

  it.each([
    { mode: '요청 만료일 유지', date: null, extra: {} },
    {
      mode: '만료일 변경',
      date: '2099-12-30',
      extra: { requested_expiration: '2099-12-30T23:59:59.000Z' },
    },
  ])(
    'requester $mode preserves omitted fields and sends only supported scope changes',
    async ({ mode, date, extra }) => {
      const detail = ownerDetailFixture();
      const base = installFetch();
      const writes: unknown[] = [];
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === '/permission-requests/mine')
          return new Response(JSON.stringify({ requests: [detail] }));
        if (init?.method === 'PATCH') {
          writes.push(JSON.parse(init.body as string));
          return new Response(
            JSON.stringify({
              id: detail.id,
              revision: 8,
              status: 'pending',
              updated_at: detail.updated_at,
            }),
          );
        }
        if (url === `/permission-requests/${detail.id}`)
          return new Response(JSON.stringify(detail));
        return base(input, init);
      }) as typeof fetch;
      renderHome();
      fireEvent.click(await screen.findByRole('button', { name: /Finding 관리/ }));
      await screen.findByDisplayValue('original reason');
      fireEvent.keyDown(screen.getByRole('combobox', { name: '요청 범위' }), { key: 'ArrowDown' });
      fireEvent.click(await screen.findByRole('option', { name: 'Managed System · cccccccc' }));
      fireEvent.click(screen.getByRole('radio', { name: mode }));
      if (date) fireEvent.change(screen.getByLabelText('새 만료일'), { target: { value: date } });
      fireEvent.click(screen.getByRole('button', { name: '수정' }));
      await waitFor(() =>
        expect(writes).toEqual([
          {
            expected_revision: 7,
            requested_managed_system_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            ...extra,
          },
        ]),
      );
    },
  );

  it('closing or Escape never withdraws; confirmed withdrawal removes only that row and reopening uses a fresh read', async () => {
    let detail = ownerDetailFixture();
    const other = {
      ...detail,
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      requested_capability: 'voc.read',
    };
    let rows = [detail, other];
    const base = installFetch();
    const cancels: unknown[] = [];
    let reads = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/permission-requests/mine')
        return new Response(JSON.stringify({ requests: rows }));
      if (url === `/permission-requests/${detail.id}`) {
        reads += 1;
        return new Response(JSON.stringify(detail));
      }
      if (url.endsWith('/cancel')) {
        cancels.push(JSON.parse(init?.body as string));
        rows = [other];
        return new Response(
          JSON.stringify({
            id: detail.id,
            revision: 9,
            status: 'cancelled',
            updated_at: detail.updated_at,
          }),
        );
      }
      return base(input, init);
    }) as typeof fetch;
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: /Finding 관리/ }));
    await screen.findByDisplayValue('original reason');
    fireEvent.click(screen.getByTestId('owner-request-close'));
    await waitFor(() =>
      expect(screen.queryByTestId('owner-permission-request-dialog')).not.toBeInTheDocument(),
    );
    detail = { ...detail, revision: 8, reason: 'latest reason' };
    fireEvent.click(screen.getByRole('button', { name: /Finding 관리/ }));
    await screen.findByDisplayValue('latest reason');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByTestId('owner-permission-request-dialog')).not.toBeInTheDocument(),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(cancels).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: /Finding 관리/ }));
    await screen.findByDisplayValue('latest reason');
    fireEvent.click(screen.getByRole('button', { name: '요청 철회' }));
    const confirmation = screen.getByTestId('owner-withdraw-confirmation');
    expect(cancels).toEqual([]);
    fireEvent.change(within(confirmation).getByLabelText('철회 사유 · 선택'), {
      target: { value: '  no longer needed  ' },
    });
    fireEvent.click(within(confirmation).getByRole('button', { name: '요청 철회' }));
    await waitFor(() =>
      expect(cancels).toEqual([{ expected_revision: 8, reason: 'no longer needed' }]),
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Finding 관리/ })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /VOC 조회/ })).toBeInTheDocument();
    expect(reads).toBeGreaterThanOrEqual(3);
  });

  it.each([
    [false, false],
    [true, false],
    [false, true],
  ])(
    'requester stale retains unsaved input/focus and requires explicit reconciliation (failed read: %s, terminal: %s)',
    async (failedRead, terminal) => {
      const original = ownerDetailFixture();
      let reads = 0;
      const writes: Array<{ body: unknown; key: string | null }> = [];
      const base = installFetch();
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === '/permission-requests/mine')
          return new Response(JSON.stringify({ requests: [original] }));
        if (url === `/permission-requests/${original.id}` && init?.method === 'PATCH') {
          writes.push({
            body: JSON.parse(init.body as string),
            key: new Headers(init.headers).get('Idempotency-Key'),
          });
          return new Response(
            JSON.stringify({
              code: 'conflict.stale_write',
              message: 'stale',
              detail: { current_revision: 8 },
            }),
            { status: 409 },
          );
        }
        if (url === `/permission-requests/${original.id}`) {
          reads += 1;
          if (failedRead && reads > 1)
            return new Response(
              JSON.stringify({ code: 'internal.unexpected', message: 'failed read' }),
              { status: 500 },
            );
          return new Response(
            JSON.stringify(
              reads === 1
                ? original
                : {
                    ...original,
                    revision: 8,
                    reason: 'server edit',
                    ...(terminal ? { status: 'approved', allowed_actions: [] } : {}),
                  },
            ),
          );
        }
        return base(input, init);
      }) as typeof fetch;
      renderHome();
      fireEvent.click(await screen.findByRole('button', { name: /Finding 관리/ }));
      const input = await screen.findByDisplayValue('original reason');
      input.focus();
      fireEvent.change(input, { target: { value: 'unsaved input' } });
      fireEvent.click(screen.getByRole('button', { name: '수정' }));
      const staleNotice = await screen.findByText(
        '요청이 변경되었습니다. 입력은 유지됩니다. 최신 내용과 비교한 뒤 다시 확인해 주세요.',
      );
      if (failedRead) await screen.findByText('요청을 불러오지 못했습니다.');
      else await screen.findByText('최신 요청 사유 · server edit');
      expect(input).toHaveValue('unsaved input');
      // One stale message at a time: the generic conflict error line yields to
      // the stale section, and focus moves to the stale notice.
      expect(staleNotice).toHaveFocus();
      expect(
        screen.queryByText('요청 내용이 변경되었습니다. 최신 요청을 확인한 후 다시 시도해 주세요.'),
      ).not.toBeInTheDocument();
      if (!terminal) expect(screen.getByRole('button', { name: '수정' })).toBeDisabled();
      else expect(screen.queryByRole('button', { name: '수정' })).not.toBeInTheDocument();
      await act(async () => {
        await Promise.resolve();
      });
      expect(writes).toHaveLength(1);
      const reconcile = screen.getByRole('button', { name: '최신 요청 확인 · 입력 유지' });
      if (failedRead) expect(reconcile).toBeDisabled();
      else {
        fireEvent.click(reconcile);
        if (terminal) {
          expect(screen.queryByRole('button', { name: '수정' })).not.toBeInTheDocument();
          expect(writes).toHaveLength(1);
          return;
        }
        expect(input).toHaveFocus();
        fireEvent.click(screen.getByRole('button', { name: '수정' }));
        await waitFor(() => expect(writes).toHaveLength(2));
        expect(writes[1]?.body).toEqual({ expected_revision: 8, reason: 'unsaved input' });
        expect(writes[1]?.key).not.toBe(writes[0]?.key);
      }
    },
  );

  it('withdrawal refreshes a cached pending permission check so the capability can be requested again', async () => {
    const detail = ownerDetailFixture();
    let cancelled = false;
    const base = installFetch();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('/me/permissions/check'))
        return new Response(
          JSON.stringify({
            state: cancelled ? 'request_access' : 'pending_request',
            decision: { allow: false, reason: 'no_grant', requestable: null },
          }),
        );
      if (url === '/permission-requests/mine')
        return new Response(JSON.stringify({ requests: cancelled ? [] : [detail] }));
      if (url.endsWith('/cancel')) {
        cancelled = true;
        return new Response(
          JSON.stringify({
            id: detail.id,
            revision: 8,
            status: 'cancelled',
            updated_at: detail.updated_at,
          }),
        );
      }
      if (url === `/permission-requests/${detail.id}`) return new Response(JSON.stringify(detail));
      return base(input, init);
    }) as typeof fetch;
    const { queryClient } = renderHome();
    render(
      <QueryClientProvider client={queryClient}>
        <PermissionGate capability="finding.manage">
          <span>protected</span>
        </PermissionGate>
      </QueryClientProvider>,
    );
    await screen.findByText('권한 요청 검토 중');
    fireEvent.click(await screen.findByRole('button', { name: /Finding 관리/ }));
    await screen.findByDisplayValue('original reason');
    fireEvent.click(screen.getByRole('button', { name: '요청 철회' }));
    fireEvent.click(
      within(screen.getByTestId('owner-withdraw-confirmation')).getByRole('button', {
        name: '요청 철회',
      }),
    );
    await screen.findByRole('button', { name: '권한 요청' });
    expect(screen.queryByText('권한 요청 검토 중')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Finding 관리/ })).not.toBeInTheDocument();
  });

  it('a validation failure preserves requester inputs and focuses the field without a second command', async () => {
    const detail = ownerDetailFixture();
    const base = installFetch();
    let writes = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/permission-requests/mine')
        return new Response(JSON.stringify({ requests: [detail] }));
      if (init?.method === 'PATCH') {
        writes += 1;
        return new Response(JSON.stringify({ code: 'validation.failed', message: 'rejected' }), {
          status: 422,
        });
      }
      if (url === `/permission-requests/${detail.id}`) return new Response(JSON.stringify(detail));
      return base(input, init);
    }) as typeof fetch;
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: /Finding 관리/ }));
    const input = await screen.findByDisplayValue('original reason');
    input.focus();
    fireEvent.change(input, { target: { value: 'retained reason' } });
    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    await screen.findByRole('alert');
    expect(input).toHaveValue('retained reason');
    expect(input).toHaveFocus();
    expect(writes).toBe(1);
  });

  it.each(['pending', 'needs_more_info'] as const)(
    'blocks a no-op %s command until the draft differs from the baseline',
    async (status) => {
      const detail = ownerDetailFixture(status);
      const base = installFetch();
      let writes = 0;
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === '/permission-requests/mine')
          return new Response(JSON.stringify({ requests: [detail] }));
        if (init?.method === 'PATCH' || url.endsWith('/submit-more-info')) {
          writes += 1;
          return new Response(JSON.stringify({ id: detail.id, revision: 8, status: 'pending' }), {
            status: 200,
          });
        }
        if (url === `/permission-requests/${detail.id}`)
          return new Response(JSON.stringify(detail));
        return base(input, init);
      }) as typeof fetch;
      renderHome();
      fireEvent.click(await screen.findByRole('button', { name: /Finding 관리/ }));
      await screen.findByDisplayValue('original reason');
      const submit = screen.getByRole('button', {
        name: status === 'pending' ? '수정' : '보완 제출',
      });
      expect(submit).toBeDisabled();
      expect(screen.getByText('변경 사항이 없습니다.')).toBeInTheDocument();
      fireEvent.click(submit);
      await act(async () => {
        await Promise.resolve();
      });
      expect(writes).toBe(0);
      fireEvent.change(screen.getByLabelText('사유'), { target: { value: 'changed reason' } });
      expect(submit).toBeEnabled();
    },
  );

  it('client validation marks the invalid field, links the message and focuses it', async () => {
    const detail = ownerDetailFixture();
    const base = installFetch();
    let writes = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/permission-requests/mine')
        return new Response(JSON.stringify({ requests: [detail] }));
      if (init?.method === 'PATCH') {
        writes += 1;
        return new Response(JSON.stringify({ id: detail.id, revision: 8, status: 'pending' }), {
          status: 200,
        });
      }
      if (url === `/permission-requests/${detail.id}`) return new Response(JSON.stringify(detail));
      return base(input, init);
    }) as typeof fetch;
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: /Finding 관리/ }));
    const input = await screen.findByDisplayValue('original reason');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('사유를 입력하세요.');
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'owner-request-validation');
    expect(alert).toHaveAttribute('id', 'owner-request-validation');
    await act(async () => {
      await Promise.resolve();
    });
    expect(writes).toBe(0);
  });

  it.each([
    { path: 'Escape', succeed: false },
    { path: '닫기', succeed: false },
    { path: 'a successful 수정', succeed: true },
  ])('returns focus to the opening row after closing via $path', async ({ path, succeed }) => {
    const detail = ownerDetailFixture();
    const base = installFetch();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/permission-requests/mine')
        return new Response(JSON.stringify({ requests: [detail] }));
      if (init?.method === 'PATCH')
        return new Response(
          JSON.stringify({
            id: detail.id,
            revision: 8,
            status: 'pending',
            updated_at: detail.updated_at,
          }),
          { status: 200 },
        );
      if (url === `/permission-requests/${detail.id}`) return new Response(JSON.stringify(detail));
      return base(input, init);
    }) as typeof fetch;
    renderHome();
    const row = await screen.findByRole('button', { name: /Finding 관리/ });
    fireEvent.click(row);
    await screen.findByDisplayValue('original reason');
    if (succeed) {
      fireEvent.change(screen.getByLabelText('사유'), { target: { value: 'changed reason' } });
      fireEvent.click(screen.getByRole('button', { name: '수정' }));
    } else if (path === 'Escape') {
      fireEvent.keyDown(document.body, { key: 'Escape' });
    } else {
      fireEvent.click(screen.getByTestId('owner-request-close'));
    }
    await waitFor(() =>
      expect(screen.queryByTestId('owner-permission-request-dialog')).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(row).toHaveFocus());
  });

  it('moves focus to the remaining row after withdrawal removes the opening row', async () => {
    const detail = ownerDetailFixture();
    const other = {
      ...detail,
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      requested_capability: 'voc.read',
    };
    let rows = [detail, other];
    const base = installFetch();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/permission-requests/mine')
        return new Response(JSON.stringify({ requests: rows }));
      if (url.endsWith('/cancel')) {
        rows = [other];
        return new Response(
          JSON.stringify({
            id: detail.id,
            revision: 9,
            status: 'cancelled',
            updated_at: detail.updated_at,
          }),
        );
      }
      if (url === `/permission-requests/${detail.id}`) return new Response(JSON.stringify(detail));
      return base(input, init);
    }) as typeof fetch;
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: /Finding 관리/ }));
    await screen.findByDisplayValue('original reason');
    fireEvent.click(screen.getByRole('button', { name: '요청 철회' }));
    fireEvent.click(
      within(screen.getByTestId('owner-withdraw-confirmation')).getByRole('button', {
        name: '요청 철회',
      }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('요청이 철회되었습니다.'));
    await waitFor(() => expect(screen.getByRole('button', { name: /VOC 조회/ })).toHaveFocus());
  });

  it('keeps the panel and focuses its heading after withdrawal removes the last row', async () => {
    const detail = ownerDetailFixture();
    let rows = [detail];
    const emptySummary = dashboardSummarySchema.parse({
      ...response,
      kpis: {},
      action_queues: [],
      coverage: [],
    });
    const base = installFetch(emptySummary, { roleLevel: 'user' });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/permission-requests/mine')
        return new Response(JSON.stringify({ requests: rows }));
      if (url.endsWith('/cancel')) {
        rows = [];
        return new Response(
          JSON.stringify({
            id: detail.id,
            revision: 9,
            status: 'cancelled',
            updated_at: detail.updated_at,
          }),
        );
      }
      if (url === `/permission-requests/${detail.id}`) return new Response(JSON.stringify(detail));
      return base(input, init);
    }) as typeof fetch;
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: /Finding 관리/ }));
    await screen.findByDisplayValue('original reason');
    fireEvent.click(screen.getByRole('button', { name: '요청 철회' }));
    fireEvent.click(
      within(screen.getByTestId('owner-withdraw-confirmation')).getByRole('button', {
        name: '요청 철회',
      }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('요청이 철회되었습니다.'));
    await waitFor(() => expect(screen.getByRole('heading', { name: '열린 요청' })).toHaveFocus());
  });

  it('withdrawal confirmation replaces the edit form and 취소 returns to it', async () => {
    const detail = ownerDetailFixture();
    const base = installFetch();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/permission-requests/mine')
        return new Response(JSON.stringify({ requests: [detail] }));
      if (url === `/permission-requests/${detail.id}`) return new Response(JSON.stringify(detail));
      return base(input, init);
    }) as typeof fetch;
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: /Finding 관리/ }));
    await screen.findByDisplayValue('original reason');
    expect(screen.getByLabelText('사유')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '요청 철회' }));
    const confirmation = screen.getByTestId('owner-withdraw-confirmation');
    const withdrawReason = within(confirmation).getByLabelText('철회 사유 · 선택');
    expect(withdrawReason).toHaveFocus();
    expect(screen.queryByLabelText('사유')).not.toBeInTheDocument();
    expect(within(confirmation).getByRole('button', { name: '취소' })).toBeInTheDocument();
    fireEvent.click(within(confirmation).getByRole('button', { name: '취소' }));
    expect(screen.queryByTestId('owner-withdraw-confirmation')).not.toBeInTheDocument();
    expect(screen.getByLabelText('사유')).toBeInTheDocument();
  });

  it('a stale withdrawal exits the confirmation and keeps focus through reconciliation', async () => {
    const detail = ownerDetailFixture();
    const base = installFetch();
    let writes = 0;
    let reads = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/permission-requests/mine')
        return new Response(JSON.stringify({ requests: [detail] }));
      if (url.endsWith('/cancel')) {
        writes += 1;
        return new Response(
          JSON.stringify({
            code: 'conflict.stale_write',
            message: 'stale',
            detail: { current_revision: 8 },
          }),
          { status: 409 },
        );
      }
      if (url === `/permission-requests/${detail.id}`) {
        reads += 1;
        return new Response(
          JSON.stringify(reads === 1 ? detail : { ...detail, revision: 8, reason: 'server edit' }),
        );
      }
      return base(input, init);
    }) as typeof fetch;
    renderHome();
    const user = userEvent.setup();
    fireEvent.click(await screen.findByRole('button', { name: /Finding 관리/ }));
    await screen.findByDisplayValue('original reason');
    await user.click(screen.getByRole('button', { name: '요청 철회' }));
    await user.click(
      within(screen.getByTestId('owner-withdraw-confirmation')).getByRole('button', {
        name: '요청 철회',
      }),
    );
    const staleNotice = await screen.findByText(
      '요청이 변경되었습니다. 입력은 유지됩니다. 최신 내용과 비교한 뒤 다시 확인해 주세요.',
    );
    // The confirmation yields to the stale comparison instead of unmounting
    // the fields 최신 요청 확인 needs for focus.
    expect(screen.queryByTestId('owner-withdraw-confirmation')).not.toBeInTheDocument();
    expect(staleNotice).toHaveFocus();
    await user.click(screen.getByRole('button', { name: '최신 요청 확인 · 입력 유지' }));
    expect(screen.getByLabelText('사유')).toHaveFocus();
    // 입력 유지: the untouched draft survives reconciliation; the stale
    // section above shows 최신 요청 사유 · server edit for comparison.
    expect(screen.getByLabelText('사유')).toHaveValue('original reason');
    await act(async () => {
      await Promise.resolve();
    });
    expect(writes).toBe(1);
  });

  it('returns focus to the scope select when a scope-only change is refused', async () => {
    const detail = ownerDetailFixture();
    const base = installFetch();
    let writes = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/permission-requests/mine')
        return new Response(JSON.stringify({ requests: [detail] }));
      if (init?.method === 'PATCH') {
        writes += 1;
        return new Response(
          JSON.stringify({ code: 'conflict.capability_already_granted', message: 'refused' }),
          { status: 409 },
        );
      }
      if (url === `/permission-requests/${detail.id}`) return new Response(JSON.stringify(detail));
      return base(input, init);
    }) as typeof fetch;
    renderHome();
    const user = userEvent.setup();
    fireEvent.click(await screen.findByRole('button', { name: /Finding 관리/ }));
    const trigger = await screen.findByRole('combobox', { name: '요청 범위' });
    // A real pointer click focuses the trigger before the select opens; the
    // tracked target is what the refused PATCH must return focus to.
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: 'Managed System · cccccccc' }));
    await user.click(screen.getByRole('button', { name: '수정' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('이미 권한이 부여되어 있습니다.');
    expect(trigger).toBeEnabled();
    expect(trigger).toHaveFocus();
    await act(async () => {
      await Promise.resolve();
    });
    expect(writes).toBe(1);
  });

  it.each(['요청 범위', '만료일'] as const)(
    'blocks 보완 제출 when only %s changed until 사유 answers',
    async (field) => {
      const detail = ownerDetailFixture('needs_more_info');
      const base = installFetch();
      let writes = 0;
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === '/permission-requests/mine')
          return new Response(JSON.stringify({ requests: [detail] }));
        if (init?.method === 'PATCH' || url.endsWith('/submit-more-info')) {
          writes += 1;
          return new Response(JSON.stringify({ id: detail.id, revision: 8, status: 'pending' }), {
            status: 200,
          });
        }
        if (url === `/permission-requests/${detail.id}`)
          return new Response(JSON.stringify(detail));
        return base(input, init);
      }) as typeof fetch;
      renderHome();
      const user = userEvent.setup();
      fireEvent.click(await screen.findByRole('button', { name: /Finding 관리/ }));
      await screen.findByDisplayValue('original reason');
      const submit = screen.getByRole('button', { name: '보완 제출' });
      if (field === '요청 범위') {
        const trigger = screen.getByRole('combobox', { name: '요청 범위' });
        trigger.focus();
        fireEvent.keyDown(trigger, { key: 'ArrowDown' });
        fireEvent.click(await screen.findByRole('option', { name: 'Managed System · cccccccc' }));
      } else {
        await user.click(screen.getByRole('radio', { name: '만료일 변경' }));
        fireEvent.change(screen.getByLabelText('새 만료일'), { target: { value: '2099-12-30' } });
      }
      expect(submit).toBeDisabled();
      await user.click(submit);
      await act(async () => {
        await Promise.resolve();
      });
      expect(writes).toBe(0);
      await user.type(screen.getByLabelText('사유'), ' and my answer');
      expect(submit).toBeEnabled();
    },
  );

  it('취소 returns focus to the 요청 철회 button that opened the confirmation', async () => {
    const detail = ownerDetailFixture();
    const base = installFetch();
    let writes = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/permission-requests/mine')
        return new Response(JSON.stringify({ requests: [detail] }));
      if (url.endsWith('/cancel')) {
        writes += 1;
        return new Response(
          JSON.stringify({
            id: detail.id,
            revision: 9,
            status: 'cancelled',
            updated_at: detail.updated_at,
          }),
        );
      }
      if (url === `/permission-requests/${detail.id}`) return new Response(JSON.stringify(detail));
      return base(input, init);
    }) as typeof fetch;
    renderHome();
    const user = userEvent.setup();
    fireEvent.click(await screen.findByRole('button', { name: /Finding 관리/ }));
    await screen.findByDisplayValue('original reason');
    await user.click(screen.getByRole('button', { name: '요청 철회' }));
    const confirmation = screen.getByTestId('owner-withdraw-confirmation');
    expect(within(confirmation).getByLabelText('철회 사유 · 선택')).toHaveFocus();
    await user.click(within(confirmation).getByRole('button', { name: '취소' }));
    expect(screen.queryByTestId('owner-withdraw-confirmation')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '요청 철회' })).toHaveFocus();
    await act(async () => {
      await Promise.resolve();
    });
    expect(writes).toBe(0);
  });

  it('resolves Managed System names in the scope select and the stale comparison', async () => {
    const detail = {
      ...ownerDetailFixture(),
      requested_managed_system_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    };
    const base = installFetch();
    let reads = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('/managed-systems'))
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
                name: 'Power BI',
                archived_at: null,
              },
            ],
            total: 1,
          }),
        );
      if (url === '/permission-requests/mine')
        return new Response(JSON.stringify({ requests: [detail] }));
      if (url === `/permission-requests/${detail.id}` && init?.method !== 'PATCH') {
        reads += 1;
        return new Response(
          JSON.stringify(reads === 1 ? detail : { ...detail, revision: 8, reason: 'server edit' }),
        );
      }
      if (init?.method === 'PATCH')
        return new Response(JSON.stringify({ code: 'conflict.stale_write', message: 'stale' }), {
          status: 409,
        });
      return base(input, init);
    }) as typeof fetch;
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: /Finding 관리/ }));
    await screen.findByDisplayValue('original reason');
    fireEvent.keyDown(screen.getByRole('combobox', { name: '요청 범위' }), { key: 'ArrowDown' });
    expect(await screen.findByRole('option', { name: 'Power BI' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /cccccccc/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'Power BI' }));
    fireEvent.change(screen.getByLabelText('사유'), { target: { value: 'dirty reason' } });
    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    await screen.findByText(
      '요청이 변경되었습니다. 입력은 유지됩니다. 최신 내용과 비교한 뒤 다시 확인해 주세요.',
    );
    expect(await screen.findByText('요청 범위 · Power BI')).toBeInTheDocument();
  });

  it('restores field focus after a delayed server error once pending clears', async () => {
    const detail = ownerDetailFixture();
    const base = installFetch();
    let rejectPatch: ((reason?: unknown) => void) | undefined;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/permission-requests/mine')
        return new Response(JSON.stringify({ requests: [detail] }));
      if (init?.method === 'PATCH')
        return new Promise<Response>((_resolve, reject) => {
          rejectPatch = reject;
        });
      if (url === `/permission-requests/${detail.id}`) return new Response(JSON.stringify(detail));
      return base(input, init);
    }) as typeof fetch;
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: /Finding 관리/ }));
    const input = await screen.findByDisplayValue('original reason');
    input.focus();
    fireEvent.change(input, { target: { value: 'doomed reason' } });
    const submit = screen.getByRole('button', { name: '수정' });
    // A real pointer click transfers focus to the submit button; the delayed
    // response leaves it there while the field is disabled.
    submit.focus();
    fireEvent.click(submit);
    await waitFor(() => expect(screen.getByLabelText('사유')).toBeDisabled());
    await act(async () => {
      rejectPatch?.(new TypeError('network failure'));
    });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('일시적 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    expect(input).toBeEnabled();
    expect(input).toHaveValue('doomed reason');
    expect(input).toHaveFocus();
  });

  it('keeps the empty open permission request panel mounted after the query resolves', async () => {
    installFetch();
    renderHome();
    await screen.findByTestId('home-action-queues');
    expect(screen.getByRole('heading', { name: '열린 요청' })).toBeInTheDocument();
    expect(screen.getByText('열린 요청이 없습니다.')).toBeInTheDocument();
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

  it.each([
    ['with personal assignments', true, ['home-my-work', 'home-action-queues']],
    ['without personal assignments', false, ['home-action-queues', 'home-my-work']],
  ] as const)(
    'orders assigned work from returned data %s',
    async (_caseName, hasAssignments, expectedOrder) => {
      installFetch(response, {
        ...(hasAssignments
          ? {
              taskItems: [
                { id: 'task-a1', display_id: 'TSK-701', title: '담당 Task', status: 'doing' },
              ],
              taskRequestItems: [
                {
                  id: 'request-b2',
                  display_id: 'REQ-902',
                  requested_outcome: '검토 Task Request',
                  status: 'pending_review',
                },
              ],
            }
          : {}),
      });
      renderHome();

      await screen.findByText(
        hasAssignments ? 'TSK-701 — 담당 Task' : '현재 내게 배정된 작업이 없습니다.',
      );
      await screen.findByTestId('home-action-queues');
      const panelOrder = Array.from(
        document.querySelectorAll(
          '[data-testid="home-my-work"], [data-testid="home-action-queues"]',
        ),
      ).map((element) => element.getAttribute('data-testid'));
      expect(panelOrder).toEqual(expectedOrder);
    },
  );

  it.each([
    { status: 403, reporterEmpty: true },
    { status: 500, reporterEmpty: false },
  ])(
    'treats a $status personal-work response as reporter-empty: $reporterEmpty',
    async ({ status, reporterEmpty }) => {
      const emptySummary = dashboardSummarySchema.parse({
        ...response,
        kpis: {},
        action_queues: [],
        coverage: [],
      });
      installFetch(emptySummary, { roleLevel: 'user', personalWorkStatus: status });
      renderHome();

      await screen.findByRole('heading', { name: '응답할 Survey' });
      await waitFor(() =>
        expect(screen.queryByTestId('home-reporter-layout') !== null).toBe(reporterEmpty),
      );
      if (reporterEmpty) expect(screen.getByRole('link', { name: '내 VOC' })).toBeInTheDocument();
    },
  );

  it.each([
    ['nothing else', {}],
    [
      'one open permission request',
      {
        permissionRequests: [
          {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            revision: 1,
            requested_expiration: null,
            updated_at: '2026-10-13T00:00:00.000Z',
            return_route_intent: '/home',
            requested_capability: 'finding.manage',
            requested_managed_system_id: null,
            reason: 'Need it',
            requested_object_type: null,
            requested_object_id: null,
            source_object_type: null,
            source_object_id: null,
            source_action_id: null,
            status: 'pending',
            created_at: new Date().toISOString(),
          },
        ],
      },
    ],
    ['a non-empty action queue', { summary: response }],
  ] as const)(
    'leads a reporter with Survey and 내 VOC when personal work is denied and the actor has %s',
    async (caseName, extra) => {
      const emptySummary = dashboardSummarySchema.parse({
        ...response,
        kpis: {},
        action_queues: [],
        coverage: [],
      });
      const { summary, ...fetchOptions } = extra as { summary?: unknown };
      installFetch(summary ?? emptySummary, {
        roleLevel: 'user',
        personalWorkStatus: 403,
        ...fetchOptions,
      });
      renderHome();

      const surveys = await screen.findByRole('heading', { name: '응답할 Survey' });
      const myVocs = await screen.findByRole('link', { name: '내 VOC' });
      expect(screen.queryByText('내게 배정됨')).not.toBeInTheDocument();
      expect(screen.queryByTestId('home-my-work')).not.toBeInTheDocument();
      const later = Array.from(
        document.querySelectorAll(
          '[data-testid="home-open-requests-list"], [data-testid="home-action-queues"]',
        ),
      );
      expect(later.length).toBe(caseName === 'nothing else' ? 0 : 1);
      for (const element of [myVocs, ...later]) {
        expect(
          surveys.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      }
      if (caseName === 'one open permission request')
        expect(await screen.findByText('Finding 관리')).toBeInTheDocument();
    },
  );

  it('keeps independently loaded sections when the summary request fails', async () => {
    installFetch(response, {
      summaryStatus: 500,
      taskItems: [{ id: 'task-a1', display_id: 'TSK-701', title: '담당 Task', status: 'doing' }],
    });
    renderHome();

    expect(await screen.findByText('홈 요약을 불러올 수 없습니다.')).toBeInTheDocument();
    expect(await screen.findByText('TSK-701 — 담당 Task')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '응답할 Survey' })).toBeInTheDocument();
  });

  it('requests only the current Actor assigned-reviewer queue and keeps scope-wide summary', async () => {
    const base = installFetch();
    const requested: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requested.push(url);
      if (url.startsWith('/task-requests')) {
        const query = new URL(url, 'http://localhost').searchParams;
        return new Response(
          JSON.stringify({
            items:
              query.get('reviewer') === 'me'
                ? [
                    {
                      id: 'req-personal',
                      display_id: 'REQ-777',
                      requested_outcome: '내 검토 요청',
                      status: 'pending_review',
                      assigned_reviewer_actor_id: '11111111-1111-4111-8111-111111111111',
                      assigned_reviewer_team_id: null,
                    },
                  ]
                : [
                    {
                      id: 'req-other',
                      display_id: 'REQ-778',
                      requested_outcome: '다른 검토 요청',
                      status: 'pending_review',
                    },
                  ],
          }),
          { status: 200 },
        );
      }
      return base(input, init);
    }) as typeof globalThis.fetch;
    renderHome();
    expect(await screen.findByText('REQ-777 — 내 검토 요청')).toBeInTheDocument();
    expect(screen.queryByText('REQ-778 — 다른 검토 요청')).not.toBeInTheDocument();
    expect(
      requested.some((url) => url.startsWith('/task-requests') && url.includes('reviewer=me')),
    ).toBe(true);
    expect(
      requested
        .filter((url) => url.startsWith('/dashboard/summary'))
        .every((url) => !url.includes('reviewer=')),
    ).toBe(true);
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
      if (
        url.startsWith('/task-requests') &&
        new URL(url, 'http://localhost').searchParams.get('reviewer') === 'me'
      )
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'req-b2',
                display_id: 'REQ-902',
                requested_outcome: '재인증 흐름 개선',
                assigned_reviewer_actor_id: '11111111-1111-4111-8111-111111111111',
                assigned_reviewer_team_id: null,
                status: 'pending_review',
              },
            ],
          }),
          { status: 200 },
        );
      return base(input, init);
    }) as typeof globalThis.fetch;
    renderHome();

    await screen.findByText('TSK-701 — 쿼리 플랜 개선');
    const panel = screen.getByTestId('home-my-work');
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
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /^수신함/ })).toHaveTextContent('3'),
    );
  });

  it('keeps the page heading but hides the dashboard subtitle and actions on the Inbox tab', async () => {
    installFetch(response);
    renderHome('/home?tab=inbox');

    await screen.findByTestId('home-inbox-list');
    expect(
      screen.getByRole('heading', { level: 1, name: '안녕하세요, 지원님' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/운영 큐/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '큐 새로고침' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'VOC 생성' })).not.toBeInTheDocument();
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
