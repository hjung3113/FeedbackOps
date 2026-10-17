import { dashboardSummarySchema } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  IntegrationDashboardRouteShell,
  integrationDashboardSearchSchema,
} from '../../../routes/_authed/integration';

const MS_A = '77777777-0000-0000-0000-0000000000a1';
const MS_B = '77777777-0000-0000-0000-0000000000b2';
const WORKSPACE = '11111111-1111-4111-8111-111111111111';

const queueFixtures = [
  {
    id: 'unassigned-voc',
    severity: 'urgent',
    count: 12,
    next_action: {
      label: 'Review VOCs',
      route: '/vocs?view=inbox&tab=unassigned&selected=voc-a&action=assign_owner',
      intent: 'triage',
    },
    secondary_action: {
      label: 'Bulk assign',
      route: '/vocs?view=inbox&tab=unassigned&selected=voc-a&action=bulk_assign',
      intent: 'bulk_assign',
    },
  },
  {
    id: 'actionable-finding-no-execution',
    severity: 'warn',
    count: 8,
    next_action: {
      label: 'Request Tasks',
      route: '/findings?selected=finding-a&action=request_task',
      intent: 'plan_execution',
    },
    secondary_action: null,
  },
  {
    id: 'released-task-unresolved-voc',
    severity: 'warn',
    count: 5,
    next_action: {
      label: 'Review Updates',
      route: '/tasks?view=board&selected=task-a&action=review_reporter_status',
      intent: 'request_reporter_update',
    },
    secondary_action: null,
  },
  {
    id: 'bad-outcome-no-followup',
    severity: 'urgent',
    count: 3,
    next_action: {
      label: 'Create Follow-up',
      route: '/surveys?selected=survey-a&action=create_follow_up',
      intent: 'create_followup',
    },
    secondary_action: null,
  },
  {
    id: 'high-severity-unlinked',
    severity: 'urgent',
    count: 4,
    next_action: {
      label: 'Link Finding',
      route: '/vocs?view=inbox&tab=high-no-link&selected=voc-b&action=link_finding',
      intent: 'triage',
    },
    secondary_action: null,
  },
  {
    id: 'permission-requests-pending',
    severity: 'info',
    count: 2,
    next_action: {
      label: 'Open Requests',
      route: '/admin/permissions/requests?selected=request-a&action=review',
      intent: 'review_permissions',
    },
    secondary_action: null,
  },
] as const;

const SUMMARY = dashboardSummarySchema.parse({
  computed_at: '2026-10-13T00:00:00.000Z',
  kpis: {},
  action_queues: queueFixtures,
  coverage: [
    { id: 'voc-task', value: 18, total: 100, percent: 18, status: 'bad' },
    { id: 'finding-execution', value: 23, total: 31, percent: 74, status: 'warn' },
    { id: 'high-followup', value: 41, total: 47, percent: 87, status: 'good' },
  ],
  by_managed_system: [
    {
      managed_system_id: MS_A,
      kpis: { open_voc: 18, active_finding: 7, tasks_in_flight: 9, coverage_percent: 66 },
      coverage: {
        'voc-task': { value: 18, total: 100, percent: 18, status: 'bad' },
      },
      action_queues: { 'unassigned-voc': 0 },
    },
    {
      managed_system_id: MS_B,
      kpis: { open_voc: 4, active_finding: 3, tasks_in_flight: 2, coverage_percent: 46 },
      coverage: {
        'voc-task': { value: 90, total: 100, percent: 90, status: 'good' },
        'finding-execution': { value: 1, total: 2, percent: 50, status: 'warn' },
      },
      action_queues: { 'unassigned-voc': 5 },
    },
  ],
});

const originalFetch = globalThis.fetch;

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function managedSystemsResponse(): Response {
  return response({
    items: [
      {
        id: MS_A,
        workspace_id: WORKSPACE,
        slug: 'identity',
        name: 'Identity Platform',
        external_key: null,
        default_owner_actor_id: null,
        default_owner_team_id: null,
        archived_at: null,
        archived_by_actor_id: null,
        created_at: '2026-07-10T00:00:00.000Z',
        updated_at: '2026-07-10T00:00:00.000Z',
      },
      {
        id: MS_B,
        workspace_id: WORKSPACE,
        slug: 'analytics-workbench',
        name: 'Analytics Workbench',
        external_key: null,
        default_owner_actor_id: null,
        default_owner_team_id: null,
        archived_at: null,
        archived_by_actor_id: null,
        created_at: '2026-07-10T00:00:00.000Z',
        updated_at: '2026-07-10T00:00:00.000Z',
      },
    ],
    total: 2,
  });
}

function buildHarness(initialPath: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: '/integration',
    validateSearch: (raw) => integrationDashboardSearchSchema.parse(raw),
    component: IntegrationDashboardRouteShell,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { router, queryClient };
}

async function renderDashboard(
  initialPath = '/integration',
  fetchImpl: typeof globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/dashboard/summary')) return response(SUMMARY);
    if (url.includes('/managed-systems')) return managedSystemsResponse();
    return response({ code: 'internal.unexpected', message: 'not mocked' }, 500);
  },
) {
  globalThis.fetch = vi.fn(fetchImpl) as typeof globalThis.fetch;
  const { router, queryClient } = buildHarness(initialPath);
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('integration-dashboard')).toBeVisible());
  return { router };
}

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('integration action dashboard route', () => {
  test('renders the six returned queues and follows each backend next-action route', async () => {
    await renderDashboard();
    await screen.findByTestId('integration-queue-card-unassigned-voc');
    await screen.findByTestId('integration-managed-system-table');

    const orderedIds = [
      'unassigned-voc',
      'actionable-finding-no-execution',
      'released-task-unresolved-voc',
      'bad-outcome-no-followup',
      'high-severity-unlinked',
      'permission-requests-pending',
    ] as const;
    const expectedPrimaryLabels = {
      'unassigned-voc': 'VOC 검토',
      'actionable-finding-no-execution': 'Finding 검토',
      'released-task-unresolved-voc': 'Released Task 검토',
      'bad-outcome-no-followup': '성과 Survey 검토',
      'high-severity-unlinked': '높은 심각도 VOC 검토',
      'permission-requests-pending': '권한 요청 열기',
    } as const;
    for (const id of orderedIds) {
      const queue = queueFixtures.find((entry) => entry.id === id);
      expect(queue).toBeDefined();
      expect(screen.getByTestId(`integration-queue-card-${id}`)).toBeVisible();
      expect(screen.getByTestId(`integration-queue-count-${id}`).textContent).toBe(
        String(queue?.count),
      );
      expect(screen.getByTestId(`integration-queue-primary-${id}`)).toHaveAttribute(
        'href',
        queue?.next_action.route,
      );
      expect(screen.getByTestId(`integration-queue-primary-${id}`)).toHaveTextContent(
        expectedPrimaryLabels[id],
      );
    }
    const unassignedCard = within(screen.getByTestId('integration-queue-card-unassigned-voc'));
    expect(unassignedCard.queryByText('복구', { exact: true })).toBeNull();
    expect(unassignedCard.getByTestId('integration-queue-count-unassigned-voc')).toHaveTextContent(
      '12',
    );
    expect(unassignedCard.queryByText(/12건/)).toBeNull();
    expect(
      within(
        screen.getByTestId('integration-queue-card-actionable-finding-no-execution'),
      ).queryByText('후속 조치', { exact: true }),
    ).toBeNull();
    expect(
      screen
        .getAllByRole('link')
        .filter(
          (link) =>
            link.textContent?.includes('VOC 검토') &&
            link.getAttribute('href') === queueFixtures[0].next_action.route,
        ),
    ).toHaveLength(1);
    expect(screen.queryByRole('link', { name: '미배정 VOC 보기' })).toBeNull();

    expect(screen.getByTestId('integration-dashboard-gap-count').textContent).toBe('34');
    const surfaces = within(screen.getByTestId('integration-surfaces'));
    expect(surfaces.getByRole('link', { name: /커버리지/ })).toBeVisible();
    expect(surfaces.getByRole('link', { name: /엔티티 링크/ })).toBeVisible();
    for (const testId of [
      'integration-surface-evidence',
      'integration-surface-coverage',
      'integration-surface-links',
    ]) {
      expect(surfaces.getByTestId(testId)).not.toHaveClass(
        'rounded-md',
        'border',
        'bg-surface-card',
      );
    }
    expect(surfaces.getByRole('link', { name: /Evidence/ })).toHaveAttribute(
      'href',
      '/integration/evidence',
    );
    expect(surfaces.getByTestId('integration-surface-coverage-stat').textContent).toBe('60%');
    expect(surfaces.getByText('평균 커버리지')).toBeVisible();
    expect(surfaces.queryByText('active links')).toBeNull();
    expect(screen.getByTestId(`integration-managed-system-open-voc-${MS_A}`).textContent).toBe(
      '18',
    );
    expect(screen.getByTestId(`integration-managed-system-findings-${MS_A}`).textContent).toBe('7');
    expect(screen.getByTestId(`integration-managed-system-tasks-${MS_A}`).textContent).toBe('9');
    expect(screen.getByTestId(`integration-managed-system-unassigned-${MS_A}`).textContent).toBe(
      '0',
    );
    expect(screen.getByTestId(`integration-managed-system-open-voc-${MS_B}`).textContent).toBe('4');
    expect(screen.getByTestId(`integration-managed-system-findings-${MS_B}`).textContent).toBe('3');
    expect(screen.getByTestId(`integration-managed-system-tasks-${MS_B}`).textContent).toBe('2');
    expect(screen.getByTestId(`integration-managed-system-coverage-${MS_A}`).textContent).toBe(
      '18%',
    );
    expect(screen.getByTestId(`integration-managed-system-coverage-${MS_B}`).textContent).toBe(
      '90%',
    );
    expect(
      screen
        .getByTestId(`integration-managed-system-coverage-${MS_A}`)
        .querySelector('[role="meter"] > span'),
    ).toHaveClass('bg-accent-danger');
    expect(
      screen
        .getByTestId(`integration-managed-system-coverage-${MS_B}`)
        .querySelector('[role="meter"] > span'),
    ).toHaveClass('bg-accent-success');
  });

  test.each(['__proto__', 'constructor', 'unrecognized_intent'] as const)(
    'preserves the server label and route for the unknown %s action intent',
    async (intent) => {
      const fallbackRoute = '/vocs?view=inbox&tab=unassigned&selected=voc-a&action=keep';
      const fallbackLabel = 'Keep this server action label';
      const firstQueue = {
        ...queueFixtures[0],
        secondary_action: { label: fallbackLabel, route: fallbackRoute, intent },
      };
      const summary = dashboardSummarySchema.parse({
        ...SUMMARY,
        action_queues: [firstQueue, ...queueFixtures.slice(1)],
      });
      await renderDashboard('/integration', async (input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/dashboard/summary')) return response(summary);
        if (url.includes('/managed-systems')) return managedSystemsResponse();
        return response({ code: 'internal.unexpected', message: 'not mocked' }, 500);
      });

      const action = await screen.findByTestId('integration-queue-secondary-unassigned-voc');
      expect(action).toHaveTextContent(fallbackLabel);
      expect(action).toHaveAttribute('href', fallbackRoute);
    },
  );

  test('omits an absent queue while preserving an explicit zero count', async () => {
    const summary = dashboardSummarySchema.parse({
      ...SUMMARY,
      action_queues: [
        { ...queueFixtures[0], count: 0 },
        { ...queueFixtures[2], count: 0 },
      ],
    });
    await renderDashboard('/integration', async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/dashboard/summary')) return response(summary);
      if (url.includes('/managed-systems')) return managedSystemsResponse();
      return response({ code: 'internal.unexpected', message: 'not mocked' }, 500);
    });

    const zeroStrip = await screen.findByTestId('integration-zero-queues');
    expect(zeroStrip).toHaveTextContent('처리할 항목 없음');
    expect(screen.getByTestId('integration-zero-queue-unassigned-voc')).toHaveTextContent(
      '미배정 VOC 0',
    );
    expect(screen.getByTestId('integration-zero-queue-unassigned-voc')).toHaveAttribute(
      'href',
      queueFixtures[0].next_action.route,
    );
    expect(
      screen.getByTestId('integration-zero-queue-released-task-unresolved-voc'),
    ).toHaveTextContent('Released Task · 미해결 VOC 0');
    expect(screen.queryByTestId('integration-queue-card-unassigned-voc')).toBeNull();
    expect(screen.queryByTestId('integration-queue-card-released-task-unresolved-voc')).toBeNull();
    expect(screen.queryByTestId('integration-queue-card-high-severity-unlinked')).toBeNull();
  });

  test('maps available Managed System metrics and dashes only the omitted cells', async () => {
    const summary = dashboardSummarySchema.parse({
      ...SUMMARY,
      by_managed_system: [
        {
          managed_system_id: MS_A,
          kpis: { open_voc: 12, coverage_percent: 45 },
          action_queues: { 'unassigned-voc': 0 },
        },
      ],
    });
    await renderDashboard('/integration', async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/dashboard/summary')) return response(summary);
      if (url.includes('/managed-systems')) return managedSystemsResponse();
      return response({ code: 'internal.unexpected', message: 'not mocked' }, 500);
    });

    await screen.findByTestId('integration-managed-system-table');
    expect(screen.getByTestId(`integration-managed-system-open-voc-${MS_A}`)).toHaveTextContent(
      '12',
    );
    expect(screen.getByTestId(`integration-managed-system-findings-${MS_A}`)).toHaveTextContent(
      '—',
    );
    expect(screen.getByTestId(`integration-managed-system-tasks-${MS_A}`)).toHaveTextContent('—');
    expect(screen.getByTestId(`integration-managed-system-unassigned-${MS_A}`)).toHaveTextContent(
      '0',
    );
    // The coverage column renders the server's voc-task cell; without one the
    // metric is unavailable, not zero.
    expect(screen.getByTestId(`integration-managed-system-coverage-${MS_A}`)).toHaveTextContent(
      '—',
    );
    expect(
      screen
        .getByTestId(`integration-managed-system-coverage-${MS_A}`)
        .querySelector('[role="meter"]'),
    ).toBeNull();
  });

  test.each([
    ['open-voc', 'open_voc'],
    ['findings', 'active_finding'],
    ['tasks', 'tasks_in_flight'],
    ['coverage', 'coverage_percent'],
  ] as const)('renders a dash, not zero, when the %s KPI is omitted', async (cell, omittedKey) => {
    const kpis = { open_voc: 5, active_finding: 6, tasks_in_flight: 7, coverage_percent: 80 };
    delete (kpis as Partial<typeof kpis>)[omittedKey];
    const summary = dashboardSummarySchema.parse({
      ...SUMMARY,
      by_managed_system: [
        { managed_system_id: MS_A, kpis, action_queues: { 'unassigned-voc': 1 } },
      ],
    });
    await renderDashboard('/integration', async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/dashboard/summary')) return response(summary);
      if (url.includes('/managed-systems')) return managedSystemsResponse();
      return response({ code: 'internal.unexpected', message: 'not mocked' }, 500);
    });

    await screen.findByTestId('integration-managed-system-table');
    expect(screen.getByTestId(`integration-managed-system-${cell}-${MS_A}`)).toHaveTextContent('—');
    expect(screen.getByTestId(`integration-managed-system-${cell}-${MS_A}`)).not.toHaveTextContent(
      '0',
    );
  });

  test('renders a dash when the Unassigned queue is omitted for a row', async () => {
    const summary = dashboardSummarySchema.parse({
      ...SUMMARY,
      by_managed_system: [
        {
          managed_system_id: MS_A,
          kpis: { open_voc: 5 },
          action_queues: { 'bad-outcome-no-followup': 2 },
        },
      ],
    });
    await renderDashboard('/integration', async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/dashboard/summary')) return response(summary);
      if (url.includes('/managed-systems')) return managedSystemsResponse();
      return response({ code: 'internal.unexpected', message: 'not mocked' }, 500);
    });

    await screen.findByTestId('integration-managed-system-table');
    expect(screen.getByTestId(`integration-managed-system-unassigned-${MS_A}`)).toHaveTextContent(
      '—',
    );
  });

  test('passes the selected Managed System to the summary request', async () => {
    const requestedUrls: string[] = [];
    await renderDashboard(`/integration?managedSystem=${MS_A}`, async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      requestedUrls.push(url);
      if (url.includes('/dashboard/summary')) return response(SUMMARY);
      if (url.includes('/managed-systems')) return managedSystemsResponse();
      return response({ code: 'internal.unexpected', message: 'not mocked' }, 500);
    });

    expect(
      requestedUrls.some((url) => url.includes(`/dashboard/summary?managed_system_id=${MS_A}`)),
    ).toBe(true);
    const surfaces = within(screen.getByTestId('integration-surfaces'));
    expect(surfaces.getByRole('link', { name: /커버리지/ })).toHaveAttribute(
      'href',
      `/integration/coverage?managedSystem=${MS_A}`,
    );
    expect(surfaces.getByRole('link', { name: /엔티티 링크/ })).toHaveAttribute(
      'href',
      `/integration/links?managedSystem=${MS_A}`,
    );
  });

  test('shows the shared error state and retries the failed summary request', async () => {
    let summaryRequests = 0;
    await renderDashboard('/integration', async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/dashboard/summary')) {
        summaryRequests += 1;
        return summaryRequests === 1
          ? response({ code: 'internal.unexpected', message: 'temporary failure' }, 500)
          : response(SUMMARY);
      }
      if (url.includes('/managed-systems')) return managedSystemsResponse();
      return response({ code: 'internal.unexpected', message: 'not mocked' }, 500);
    });

    const summaryError = await screen.findByTestId('integration-dashboard-summary-error');
    expect(summaryError).toHaveTextContent('연동 요약을 불러오지 못했습니다.');
    expect(summaryError).toHaveTextContent(
      '일시적 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    );
    expect(within(summaryError).getByTestId('list-state-message')).toHaveAttribute(
      'data-variant',
      'error',
    );
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => {
      expect(screen.getByTestId('integration-queue-card-unassigned-voc')).toBeVisible();
    });
    expect(summaryRequests).toBe(2);
  });

  test('uses the blocked panel for a permission-denied summary response', async () => {
    await renderDashboard('/integration', async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/dashboard/summary')) {
        return response({ code: 'permission.denied', message: 'not available' }, 403);
      }
      if (url.includes('/managed-systems')) return managedSystemsResponse();
      return response({ code: 'internal.unexpected', message: 'not mocked' }, 500);
    });

    const blocked = await screen.findByTestId('integration-dashboard-blocked');
    const blockedPanel = within(blocked).getByText('연동 요약').closest('[data-state]');
    expect(blockedPanel).not.toBeNull();
    expect(blockedPanel).toHaveAttribute('data-state', 'denied');
    expect(screen.queryByTestId('integration-queue-card-unassigned-voc')).toBeNull();
    expect(screen.queryByTestId('integration-surface-coverage-stat')).toBeNull();
  });

  test('keeps the dashboard mounted at /integration', async () => {
    const { router } = await renderDashboard('/integration');
    expect(router.state.location.pathname).toBe('/integration');
    expect(screen.getByRole('heading', { level: 1, name: '연동 액션 대시보드' })).toBeVisible();
  });

  test('strictly accepts the documented Managed System scope search values', () => {
    expect(integrationDashboardSearchSchema.parse({ managedSystem: MS_A })).toEqual({
      managedSystem: MS_A,
    });
    expect(integrationDashboardSearchSchema.parse({ managedSystem: 'all' })).toEqual({
      managedSystem: 'all',
    });
    expect(() => integrationDashboardSearchSchema.parse({ managedSystem: 'invalid' })).toThrow();
    expect(() => integrationDashboardSearchSchema.parse({ unknown: 'value' })).toThrow();
  });

  test('renders total-zero system coverage as neutral no_data and averages measured metrics only', async () => {
    const summary = dashboardSummarySchema.parse({
      ...SUMMARY,
      coverage: [
        { id: 'voc-task', value: 0, total: 0, percent: 0, status: 'no_data' },
        { id: 'finding-execution', value: 23, total: 31, percent: 74, status: 'warn' },
      ],
      by_managed_system: [
        {
          managed_system_id: MS_A,
          kpis: { open_voc: 0 },
          coverage: { 'voc-task': { value: 0, total: 0, percent: 0, status: 'no_data' } },
          action_queues: { 'unassigned-voc': 0 },
        },
      ],
    });
    await renderDashboard('/integration', async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/dashboard/summary')) return response(summary);
      if (url.includes('/managed-systems')) return managedSystemsResponse();
      return response({ code: 'internal.unexpected', message: 'not mocked' }, 500);
    });

    await screen.findByTestId('integration-managed-system-table');
    // ADR-0067 56-1/O2: the empty denominator is neutral, not a red 0%.
    const cell = screen.getByTestId(`integration-managed-system-coverage-${MS_A}`);
    expect(cell).toHaveTextContent('집계 대상 없음');
    expect(cell.querySelector('[role="meter"]')).toBeNull();
    // The average covers measured metrics only (74, excluding the no_data 0).
    const surfaces = within(screen.getByTestId('integration-surfaces'));
    expect(surfaces.getByTestId('integration-surface-coverage-stat').textContent).toBe('74%');

    const allNoData = dashboardSummarySchema.parse({
      ...SUMMARY,
      coverage: [{ id: 'voc-task', value: 0, total: 0, percent: 0, status: 'no_data' }],
    });
    cleanup();
    await renderDashboard('/integration', async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/dashboard/summary')) return response(allNoData);
      if (url.includes('/managed-systems')) return managedSystemsResponse();
      return response({ code: 'internal.unexpected', message: 'not mocked' }, 500);
    });
    // No measurable metric: the card explains itself instead of dropping the
    // caption (#1087 UX) — 평균 커버리지 · 집계 대상 없음, muted.
    const noDataStat = await screen.findByTestId('integration-surface-coverage-stat');
    expect(noDataStat.textContent).toBe('평균 커버리지 · 집계 대상 없음');
    expect(noDataStat.className).toContain('text-text-muted');
    expect(noDataStat.className).not.toContain('text-accent-danger');
  });
});

test('Evidence entry preserves Managed System without inventing a count (#1107)', async () => {
  await renderDashboard(`/integration?managedSystem=${MS_A}`);
  const card = await screen.findByTestId('integration-surface-evidence');
  expect(card.getAttribute('href')).toBe(`/integration/evidence?managedSystem=${MS_A}`);
  expect(within(card).getByText('Evidence')).toBeVisible();
  expect(screen.queryByTestId('integration-surface-evidence-stat')).toBeNull();
});

test.each(queueFixtures.map((queue) => [queue.id, queue.next_action.route] as const))(
  'queue card primary link keeps the selected Managed System on %s (#1179)',
  async (id, route) => {
    await renderDashboard(`/integration?managedSystem=${MS_A}`);
    expect(await screen.findByTestId(`integration-queue-primary-${id}`)).toHaveAttribute(
      'href',
      `${route}&managedSystem=${MS_A}`,
    );
  },
);

test('queue card secondary link keeps the selected Managed System (#1179)', async () => {
  const secondaryAction = {
    label: 'Keep secondary action',
    route: '/vocs?view=inbox&tab=unassigned&action=keep',
    intent: 'unrecognized_intent',
  };
  const summary = dashboardSummarySchema.parse({
    ...SUMMARY,
    action_queues: [
      { ...queueFixtures[0], secondary_action: secondaryAction },
      ...queueFixtures.slice(1),
    ],
  });
  await renderDashboard(`/integration?managedSystem=${MS_A}`, async (input) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/dashboard/summary')) return response(summary);
    if (url.includes('/managed-systems')) return managedSystemsResponse();
    return response({ code: 'internal.unexpected', message: 'not mocked' }, 500);
  });
  expect(await screen.findByTestId('integration-queue-secondary-unassigned-voc')).toHaveAttribute(
    'href',
    `${secondaryAction.route}&managedSystem=${MS_A}`,
  );
});

test.each(['', `?managedSystem=${MS_A}`])(
  'Coverage secondary entry keeps scope %s',
  async (scope) => {
    await renderDashboard(`/integration${scope}`);
    const link = await screen.findByRole('link', { name: 'Analytics Area별 현황' });
    expect(link).toHaveAttribute(
      'href',
      `/integration/coverage?view=areas${scope.replace('?', '&')}`,
    );
    expect(screen.getByTestId('integration-surface-coverage')).toHaveAttribute(
      'href',
      `/integration/coverage${scope}`,
    );
    expect(screen.getByTestId('integration-surface-coverage').contains(link)).toBe(false);
  },
);
