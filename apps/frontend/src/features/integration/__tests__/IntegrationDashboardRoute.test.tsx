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
      intent: 'assign-owner',
    },
    secondary_action: {
      label: 'Bulk assign',
      route: '/vocs?view=inbox&tab=unassigned&selected=voc-a&action=bulk_assign',
      intent: 'bulk-assign',
    },
  },
  {
    id: 'actionable-finding-no-execution',
    severity: 'warn',
    count: 8,
    next_action: {
      label: 'Request Tasks',
      route: '/findings?selected=finding-a&action=request_task',
      intent: 'request-task',
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
      intent: 'review-update',
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
      intent: 'create-follow-up',
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
      intent: 'link-finding',
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
      intent: 'review',
    },
    secondary_action: null,
  },
] as const;

const SUMMARY = dashboardSummarySchema.parse({
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
    }

    expect(screen.getByTestId('integration-dashboard-gap-count').textContent).toBe('34');
    const surfaces = within(screen.getByTestId('integration-surfaces'));
    expect(surfaces.getByRole('link', { name: /Coverage/ })).toBeVisible();
    expect(surfaces.getByRole('link', { name: /Entity links/ })).toBeVisible();
    expect(
      surfaces.getByText(
        'VOC·Finding·Task·Survey 사이의 연결 상태(활성·오래됨·분리됨)를 점검합니다.',
      ),
    ).toBeVisible();
    expect(surfaces.queryByRole('link', { name: /Evidence/ })).toBeNull();
    expect(surfaces.getByTestId('integration-surface-coverage-stat').textContent).toBe('60%');
    expect(surfaces.queryByText('active links')).toBeNull();
    expect(screen.getByTestId(`integration-managed-system-open-voc-${MS_A}`).textContent).toBe(
      '18',
    );
    expect(screen.getByTestId(`integration-managed-system-findings-${MS_A}`).textContent).toBe('7');
    expect(screen.getByTestId(`integration-managed-system-tasks-${MS_A}`).textContent).toBe('9');
    expect(screen.getByTestId(`integration-managed-system-unassigned-${MS_A}`).textContent).toBe(
      '0',
    );
    expect(screen.getByTestId(`integration-managed-system-coverage-${MS_A}`).textContent).toBe(
      '66%',
    );
    expect(screen.getByTestId(`integration-managed-system-open-voc-${MS_B}`).textContent).toBe('4');
    expect(screen.getByTestId(`integration-managed-system-findings-${MS_B}`).textContent).toBe('3');
    expect(screen.getByTestId(`integration-managed-system-tasks-${MS_B}`).textContent).toBe('2');
    expect(screen.getByTestId(`integration-managed-system-unassigned-${MS_B}`).textContent).toBe(
      '5',
    );
    expect(screen.getByTestId(`integration-managed-system-coverage-${MS_B}`).textContent).toBe(
      '46%',
    );
    expect(
      screen
        .getByTestId(`integration-managed-system-coverage-${MS_A}`)
        .querySelector('[role="meter"] > span'),
    ).toHaveClass('bg-accent-success');
    expect(
      screen
        .getByTestId(`integration-managed-system-coverage-${MS_B}`)
        .querySelector('[role="meter"] > span'),
    ).toHaveClass('bg-accent-warn');
  });

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

    expect(await screen.findByTestId('integration-queue-count-unassigned-voc')).toHaveTextContent(
      '0',
    );
    expect(
      screen.getByTestId('integration-queue-count-released-task-unresolved-voc').textContent,
    ).toBe('0');
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
    expect(screen.getByTestId(`integration-managed-system-coverage-${MS_A}`)).toHaveTextContent(
      '45%',
    );
    expect(
      screen
        .getByTestId(`integration-managed-system-coverage-${MS_A}`)
        .querySelector('[role="meter"] > span'),
    ).toHaveClass('bg-accent-danger');
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
    expect(surfaces.getByRole('link', { name: /Coverage/ })).toHaveAttribute(
      'href',
      `/integration/coverage?managedSystem=${MS_A}`,
    );
    expect(surfaces.getByRole('link', { name: /Entity links/ })).toHaveAttribute(
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
    expect(within(summaryError).getByTestId('list-state-message')).toHaveAttribute(
      'data-variant',
      'error',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
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
    const blockedPanel = within(blocked).getByText('Integration summary').closest('[data-state]');
    expect(blockedPanel).not.toBeNull();
    expect(blockedPanel).toHaveAttribute('data-state', 'denied');
    expect(screen.queryByTestId('integration-queue-card-unassigned-voc')).toBeNull();
    expect(screen.queryByTestId('integration-surface-coverage-stat')).toBeNull();
  });

  test('keeps the dashboard mounted at /integration', async () => {
    const { router } = await renderDashboard('/integration');
    expect(router.state.location.pathname).toBe('/integration');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Integration Action Dashboard' }),
    ).toBeVisible();
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
});
