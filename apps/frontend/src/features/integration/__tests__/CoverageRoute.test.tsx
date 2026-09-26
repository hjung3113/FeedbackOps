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
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import {
  IntegrationCoverageRouteShell,
  integrationCoverageSearchSchema,
} from '../../../routes/_authed/integration/coverage';

const MS_A = '77777777-0000-0000-0000-0000000000a1';
const MS_B = '77777777-0000-0000-0000-0000000000b2';
const AREA_A = '88888888-0000-0000-0000-0000000000a1';

// Absence versus zero, per docs/implementation/api/dashboard.md: a missing key
// renders an em dash (MS_B finding-execution, MS_A actionable queue, the area
// row's high-severity queue); a permitted empty result renders the digit 0
// (MS_A finding-execution 0/4, MS_A unassigned-voc 0, MS_B bad-outcome 0).
const SUMMARY = dashboardSummarySchema.parse({
  kpis: { coverage_percent: 18 },
  action_queues: [
    {
      id: 'high-severity-unlinked',
      severity: 'urgent',
      count: 4,
      next_action: {
        label: 'Review high severity VOCs',
        route: '/vocs?view=inbox&tab=high-no-link',
        intent: 'review',
      },
      secondary_action: null,
    },
    {
      id: 'permission-requests-pending',
      severity: 'info',
      count: 2,
      next_action: {
        label: 'Open Requests',
        route: '/admin/permissions/requests',
        intent: 'review',
      },
      secondary_action: null,
    },
  ],
  coverage: [
    { id: 'voc-task', value: 180, total: 1000, percent: 18, status: 'warn' },
    { id: 'finding-execution', value: 23, total: 31, percent: 74, status: 'good' },
  ],
  by_managed_system: [
    {
      managed_system_id: MS_A,
      coverage: {
        'voc-task': { value: 180, total: 1000, percent: 18, status: 'warn' },
        'finding-execution': { value: 0, total: 4, percent: 0, status: 'bad' },
      },
      action_queues: { 'unassigned-voc': 0, 'high-severity-unlinked': 4 },
      analytics_areas: [
        {
          analytics_area_id: AREA_A,
          coverage: { 'voc-task': { value: 20, total: 100, percent: 20, status: 'warn' } },
          action_queues: { 'unassigned-voc': 1 },
        },
      ],
    },
    {
      managed_system_id: MS_B,
      coverage: { 'voc-task': { value: 2, total: 8, percent: 25, status: 'bad' } },
      action_queues: { 'bad-outcome-no-followup': 0 },
    },
  ],
});

function buildHarness(initialPath: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: '/integration/coverage',
    validateSearch: (raw) => integrationCoverageSearchSchema.parse(raw),
    component: IntegrationCoverageRouteShell,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { router, qc };
}

function managedSystem(id: string, slug: string, name: string) {
  return {
    id,
    workspace_id: '11111111-1111-4111-8111-111111111111',
    slug,
    name,
    external_key: null,
    default_owner_actor_id: null,
    default_owner_team_id: null,
    archived_at: null,
    archived_by_actor_id: null,
    created_at: '2026-06-18T00:00:00.000Z',
    updated_at: '2026-06-18T00:00:00.000Z',
  };
}

function stubFetch(capturedUrls: string[]) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    capturedUrls.push(url);
    if (url.includes('/dashboard/summary')) {
      return new Response(JSON.stringify(SUMMARY), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.includes('/managed-systems')) {
      return new Response(
        JSON.stringify({
          items: [
            managedSystem(MS_A, 'identity', 'Identity Platform'),
            managedSystem(MS_B, 'warehouse', 'Data Warehouse'),
          ],
          total: 2,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.includes('/analytics-areas')) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: AREA_A,
              workspace_id: '11111111-1111-4111-8111-111111111111',
              managed_system_id: MS_A,
              slug: 'growth',
              name: '성장 지표',
              owner_team_id: null,
              archived_at: null,
              archived_by_actor_id: null,
              created_at: '2026-06-18T00:00:00.000Z',
              updated_at: '2026-06-18T00:00:00.000Z',
            },
          ],
          total: 1,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response('not mocked', { status: 500 });
  }) as typeof globalThis.fetch;
}

async function renderCoverage(initialPath: string) {
  const capturedUrls: string[] = [];
  stubFetch(capturedUrls);
  const { router, qc } = buildHarness(initialPath);
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await waitFor(() => {
    expect(screen.getByTestId('integration-coverage')).toBeVisible();
  });
  await waitFor(() => {
    expect(screen.getByTestId('coverage-row-voc-task')).toBeVisible();
  });
  return capturedUrls;
}

describe('integration coverage route', () => {
  test('links a coverage row one hop through the shared route map', async () => {
    await renderCoverage('/integration/coverage');
    expect(screen.getByTestId('coverage-row-voc-task').getAttribute('href')).toBe(
      '/vocs?view=inbox&tab=no-task',
    );
    expect(screen.getByTestId('coverage-row-finding-execution').getAttribute('href')).toBe(
      '/findings?execution=none',
    );
  });

  test('links a queue row one hop and keeps workspace-level queues scoped', async () => {
    await renderCoverage('/integration/coverage');
    expect(
      screen.getByTestId('coverage-queue-row-high-severity-unlinked').getAttribute('href'),
    ).toBe('/vocs?view=inbox&tab=high-no-link');
    expect(
      screen.getByTestId('coverage-queue-row-permission-requests-pending').getAttribute('href'),
    ).toBe('/admin/permissions/requests');
  });

  test('preserves a selected managedSystem on destinations that accept it', async () => {
    await renderCoverage(`/integration/coverage?managedSystem=${MS_A}`);
    expect(screen.getByTestId('coverage-row-voc-task').getAttribute('href')).toBe(
      `/vocs?view=inbox&tab=no-task&managedSystem=${MS_A}`,
    );
    expect(screen.getByTestId('coverage-row-finding-execution').getAttribute('href')).toBe(
      `/findings?execution=none&managedSystem=${MS_A}`,
    );
    expect(
      screen.getByTestId('coverage-queue-row-permission-requests-pending').getAttribute('href'),
    ).toBe('/admin/permissions/requests');
  });

  test('renders absent keys as em dashes and explicit zeros as 0, coverage and queues', async () => {
    await renderCoverage('/integration/coverage');
    // Absent coverage key: em dash, never the digit 0.
    expect(screen.getByTestId(`coverage-cell-${MS_B}-finding-execution`).textContent).toBe('—');
    // Present zero: the digit 0.
    expect(screen.getByTestId(`coverage-cell-${MS_A}-finding-execution`).textContent).toContain(
      '0',
    );
    // Per-system queue counts: present zero vs absent key.
    expect(screen.getByTestId(`coverage-queue-cell-${MS_A}-unassigned-voc`).textContent).toBe('0');
    expect(
      screen.getByTestId(`coverage-queue-cell-${MS_A}-actionable-finding-no-execution`).textContent,
    ).toBe('—');
    expect(
      screen.getByTestId(`coverage-queue-cell-${MS_B}-bad-outcome-no-followup`).textContent,
    ).toBe('0');
  });

  test('indents analytics-area rows with VOC coverage and VOC queue counts only', async () => {
    await renderCoverage('/integration/coverage');
    const areaRow = screen.getByTestId(`coverage-area-row-${AREA_A}`);
    expect(areaRow.tagName).toBe('TR');
    expect(screen.getByTestId(`coverage-area-name-${AREA_A}`).className).toContain('pl-8');
    expect(screen.getByTestId(`coverage-cell-${AREA_A}-voc-task`).textContent).toContain('20');
    expect(screen.getByTestId(`coverage-queue-cell-${AREA_A}-unassigned-voc`).textContent).toBe(
      '1',
    );
    expect(
      screen.getByTestId(`coverage-queue-cell-${AREA_A}-high-severity-unlinked`).textContent,
    ).toBe('—');
  });

  test('has no permission-requests column, threshold control, or average-coverage KPI', async () => {
    await renderCoverage('/integration/coverage');
    expect(screen.queryByTestId('coverage-col-permission-requests-pending')).toBeNull();
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
    expect(screen.queryByText(/new policy/i)).toBeNull();
    expect(screen.queryByText(/average coverage/i)).toBeNull();
    expect(document.querySelector('input[type="number"]')).toBeNull();
  });

  test('sends managed_system_id for a selected uuid and the all-scope default otherwise', async () => {
    const uuidUrls = await renderCoverage(`/integration/coverage?managedSystem=${MS_A}`);
    expect(
      uuidUrls.some((url) => url.includes(`/dashboard/summary?managed_system_id=${MS_A}`)),
    ).toBe(true);

    const allUrls = await renderCoverage('/integration/coverage?managedSystem=all');
    expect(allUrls.some((url) => url.includes('/dashboard/summary?managed_system_id=all'))).toBe(
      true,
    );
  });
});
