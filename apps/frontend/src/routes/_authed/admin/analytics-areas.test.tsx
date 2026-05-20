// /admin/analytics-areas route tests (Slice 2 #11).

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
import { afterEach, describe, expect, test, vi } from 'vitest';

import { AnalyticsAreasAdminPage } from './analytics-areas';

function buildHarness({ initialPath }: { initialPath: string }) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/admin/analytics-areas',
    component: AnalyticsAreasAdminPage,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { router, qc };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const TABLEAU = {
  id: 'ms-tab',
  workspace_id: 'ws',
  slug: 'tableau',
  name: 'Tableau',
  external_key: null,
  default_owner_actor_id: null,
  default_owner_team_id: null,
  archived_at: null,
  archived_by_actor_id: null,
  created_at: '2026-05-17T00:00:00Z',
  updated_at: '2026-05-17T00:00:00Z',
};
const POWERBI = {
  ...TABLEAU,
  id: 'ms-pbi',
  slug: 'power-bi',
  name: 'Power BI',
};

const AA_TAB_PM = {
  id: 'aa-1',
  workspace_id: 'ws',
  managed_system_id: 'ms-tab',
  slug: 'permission-management',
  name: 'PM Tableau',
  owner_team_id: null,
  archived_at: null,
  archived_by_actor_id: null,
  created_at: '2026-05-17T00:00:00Z',
  updated_at: '2026-05-17T00:00:00Z',
};
const AA_PBI_PM = {
  ...AA_TAB_PM,
  id: 'aa-2',
  managed_system_id: 'ms-pbi',
  name: 'PM Power BI',
};

interface FetchCase {
  permissionState: 'approved' | 'request_access';
  managedSystems: unknown[];
  analyticsAreas: unknown[];
  createResponse?: { status: number; body: unknown };
}

function installFetch(c: FetchCase) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/me/permissions/check')) {
      return jsonResponse({
        state: c.permissionState,
        decision: {
          allow: c.permissionState === 'approved',
          reason: c.permissionState === 'approved' ? undefined : 'no_grant',
          via: c.permissionState === 'approved' ? 'role' : undefined,
          requestable: c.permissionState === 'request_access' ? [{ workspace_id: 'ws' }] : null,
        },
      });
    }
    if (url.includes('/managed-systems') && (!init?.method || init.method === 'GET')) {
      return jsonResponse({ items: c.managedSystems, total: c.managedSystems.length });
    }
    if (url.includes('/analytics-areas') && (!init?.method || init.method === 'GET')) {
      const filterMatch = url.match(/managed_system_id=([^&]+)/);
      let rows = c.analyticsAreas as Array<{ managed_system_id: string }>;
      if (filterMatch) rows = rows.filter((r) => r.managed_system_id === filterMatch[1]);
      return jsonResponse({ items: rows, total: rows.length });
    }
    if (url.endsWith('/analytics-areas') && init?.method === 'POST') {
      const r = c.createResponse ?? { status: 201, body: { ...AA_TAB_PM, slug: 'created' } };
      return jsonResponse(r.body, r.status);
    }
    return new Response('not mocked', { status: 500 });
  }) as typeof globalThis.fetch;
}

describe('/admin/analytics-areas route', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('admin sees grouped list across multiple MSs', async () => {
    installFetch({
      permissionState: 'approved',
      managedSystems: [TABLEAU, POWERBI],
      analyticsAreas: [AA_TAB_PM, AA_PBI_PM],
    });
    const { router, qc } = buildHarness({ initialPath: '/admin/analytics-areas' });
    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('aa-grouped-list')).toBeInTheDocument();
    });
    expect(screen.getByTestId('aa-group-ms-tab')).toBeInTheDocument();
    expect(screen.getByTestId('aa-group-ms-pbi')).toBeInTheDocument();
  });

  test('picking an MS in the filter switches to flat list filtered by that MS', async () => {
    installFetch({
      permissionState: 'approved',
      managedSystems: [TABLEAU, POWERBI],
      analyticsAreas: [AA_TAB_PM, AA_PBI_PM],
    });
    const { router, qc } = buildHarness({ initialPath: '/admin/analytics-areas' });
    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('filter-managed-system-picker')).toBeInTheDocument();
    });
    // Wait for the MS chips to load before clicking one.
    await waitFor(() => {
      expect(
        within(screen.getByTestId('filter-managed-system-picker')).getByRole('radio', {
          name: 'Tableau',
        }),
      ).toBeInTheDocument();
    });
    fireEvent.click(
      within(screen.getByTestId('filter-managed-system-picker')).getByRole('radio', {
        name: 'Tableau',
      }),
    );
    await waitFor(() => {
      expect(screen.getByTestId('analytics-areas-table')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('aa-grouped-list')).not.toBeInTheDocument();
    expect(screen.getByTestId('aa-row-permission-management')).toBeInTheDocument();
  });

  test('parent_archived response surfaces the backend envelope', async () => {
    installFetch({
      permissionState: 'approved',
      managedSystems: [TABLEAU],
      analyticsAreas: [],
      createResponse: {
        status: 409,
        body: { code: 'conflict.parent_archived', message: 'parent is archived' },
      },
    });
    const { router, qc } = buildHarness({ initialPath: '/admin/analytics-areas' });
    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('create-analytics-area-form')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(
        within(screen.getByTestId('create-ms-picker')).getByRole('radio', { name: 'Tableau' }),
      ).toBeInTheDocument();
    });
    fireEvent.click(
      within(screen.getByTestId('create-ms-picker')).getByRole('radio', { name: 'Tableau' }),
    );
    fireEvent.change(screen.getByTestId('create-aa-slug'), { target: { value: 'x' } });
    fireEvent.change(screen.getByTestId('create-aa-name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByTestId('create-aa-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('create-aa-error')).toHaveTextContent(/conflict\.parent_archived/);
    });
  });

  test('non-admin sees the gate, no create form rendered', async () => {
    installFetch({
      permissionState: 'request_access',
      managedSystems: [],
      analyticsAreas: [],
    });
    const { router, qc } = buildHarness({ initialPath: '/admin/analytics-areas' });
    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Request access' })).toBeInTheDocument();
    });
    expect(screen.queryByTestId('create-analytics-area-form')).not.toBeInTheDocument();
  });
});
