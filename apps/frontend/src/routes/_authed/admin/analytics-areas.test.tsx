// /admin/analytics-areas route tests (issue #88 catalog + slide-over rebuild).
// Verifies admin sees the guardrail callout + per-MS grouped catalog, the empty
// state per group, clicking a row opens the 460px slide-over with its sections,
// non-admin sees the PermissionGate fallback, and the register dialog surfaces
// backend envelopes.

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
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';

import { AnalyticsAreasAdminPage } from './analytics-areas';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

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
const POWERBI = { ...TABLEAU, id: 'ms-pbi', slug: 'power-bi', name: 'Power BI' };

const AA_TAB_PM = {
  id: 'aa-1',
  workspace_id: 'ws',
  managed_system_id: 'ms-tab',
  slug: 'permission-management',
  name: 'PM Tableau',
  owner_team_id: 'team-1',
  archived_at: null,
  archived_by_actor_id: null,
  created_at: '2026-05-17T00:00:00Z',
  updated_at: '2026-05-17T00:00:00Z',
};
const AA_PBI_SALES = {
  ...AA_TAB_PM,
  id: 'aa-2',
  managed_system_id: 'ms-pbi',
  slug: 'sales',
  name: 'Sales Power BI',
};
const ARCHIVED_AA = {
  ...AA_TAB_PM,
  id: 'aa-archived',
  slug: 'legacy-revenue',
  name: 'Legacy Revenue',
  archived_at: '2026-06-01T00:00:00Z',
};

interface FetchCase {
  permissionState: 'approved' | 'request_access';
  managedSystems: Array<Record<string, unknown>>;
  analyticsAreas: Array<Record<string, unknown>>;
  resolve?: { actors: unknown[]; teams: unknown[] };
  createResponse?: { status: number; body: unknown };
  requests?: string[];
}

function installFetch(c: FetchCase) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    c.requests?.push(url);
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
    if (url.includes('/actors/resolve')) {
      return jsonResponse(c.resolve ?? { actors: [], teams: [] });
    }
    if (url.includes('/managed-systems') && (!init?.method || init.method === 'GET')) {
      return jsonResponse({ items: c.managedSystems, total: c.managedSystems.length });
    }
    if (url.includes('/analytics-areas') && (!init?.method || init.method === 'GET')) {
      const query = new URL(url, 'http://localhost').searchParams;
      let items = c.analyticsAreas;
      if (query.get('managed_system_id')) {
        items = items.filter((area) => area.managed_system_id === query.get('managed_system_id'));
      }
      if (query.get('include_archived') !== 'true') {
        items = items.filter((area) => area.archived_at === null);
      }
      return jsonResponse({ items, total: items.length });
    }
    if (url.endsWith('/analytics-areas') && init?.method === 'POST') {
      const r = c.createResponse ?? { status: 201, body: { ...AA_TAB_PM, slug: 'created' } };
      return jsonResponse(r.body, r.status);
    }
    return new Response('not mocked', { status: 500 });
  }) as typeof globalThis.fetch;
}

function renderPage(c: FetchCase) {
  installFetch(c);
  const { router, qc } = buildHarness({ initialPath: '/admin/analytics-areas' });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('/admin/analytics-areas route', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('admin sees the guardrail callout + per-MS grouped catalog', async () => {
    renderPage({
      permissionState: 'approved',
      managedSystems: [TABLEAU, POWERBI],
      analyticsAreas: [AA_TAB_PM],
    });
    await waitFor(() => {
      expect(screen.getByTestId('aa-grouped-list')).toBeInTheDocument();
    });
    expect(screen.getByTestId('aa-guardrail-callout')).toHaveTextContent(
      'Analytics Area 는 MVP 권한 경계가 아닙니다',
    );
    // Both MS groups render; Tableau has one area, Power BI is empty.
    expect(screen.getByTestId('aa-group-ms-tab')).toBeInTheDocument();
    expect(screen.getByTestId('aa-row-permission-management')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('aa-group-ms-pbi')).getByText(/등록된 Analytics Area/),
    ).toBeInTheDocument();
  });

  test('filters by Managed System and archived inclusion through requests, then clears both', async () => {
    const requests: string[] = [];
    renderPage({
      permissionState: 'approved',
      managedSystems: [TABLEAU, POWERBI],
      analyticsAreas: [AA_TAB_PM, AA_PBI_SALES, ARCHIVED_AA],
      requests,
    });
    await waitFor(() => expect(screen.getByTestId('aa-row-permission-management')).toBeInTheDocument());
    expect(screen.queryByTestId('aa-row-legacy-revenue')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('aa-filter-button'));
    fireEvent.click(screen.getByTestId('aa-filter-managed-system'));
    fireEvent.click(await screen.findByRole('option', { name: 'Power BI' }));

    await waitFor(() => {
      expect(requests).toContain('/analytics-areas?managed_system_id=ms-pbi');
      expect(screen.getByTestId('aa-row-sales')).toBeInTheDocument();
      expect(screen.queryByTestId('aa-row-permission-management')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('aa-filter-managed-system'));
    fireEvent.click(await screen.findByRole('option', { name: '전체' }));
    await waitFor(() => {
      expect(requests.filter((url) => url === '/analytics-areas').length).toBeGreaterThanOrEqual(2);
      expect(screen.getByTestId('aa-row-permission-management')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('aa-filter-include-archived'));
    await waitFor(() => {
      expect(requests).toContain('/analytics-areas?include_archived=true');
      expect(screen.getByTestId('aa-row-legacy-revenue')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('aa-filter-include-archived'));
    await waitFor(() => {
      expect(requests.filter((url) => url === '/analytics-areas').length).toBeGreaterThanOrEqual(3);
      expect(screen.queryByTestId('aa-row-legacy-revenue')).not.toBeInTheDocument();
    });
  });

  test('clicking a catalog row opens the slide-over with its sections', async () => {
    renderPage({
      permissionState: 'approved',
      managedSystems: [TABLEAU],
      analyticsAreas: [AA_TAB_PM],
      resolve: { actors: [], teams: [{ id: 'team-1', name: 'Data Platform' }] },
    });
    await waitFor(() => {
      expect(screen.getByTestId('aa-row-permission-management')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('aa-row-permission-management'));
    await waitFor(() => {
      expect(screen.getByTestId('aa-slide-over')).toBeInTheDocument();
    });
    const drawer = screen.getByTestId('aa-slide-over');
    // Title appears twice: the sr-only SheetTitle (a11y) + the visible PanelTitleBlock.
    expect(within(drawer).getAllByText('PM Tableau').length).toBeGreaterThanOrEqual(1);
    // Section nav exposes all six sections including deferred Workload/Findings.
    for (const label of [
      'Overview',
      'Guardrail',
      'Definition',
      'Workload',
      'Findings',
      'Used by',
    ]) {
      expect(within(drawer).getByRole('button', { name: new RegExp(label) })).toBeInTheDocument();
    }
    // Lead resolved via /actors/resolve.
    expect(within(drawer).getByText('Data Platform')).toBeInTheDocument();
    // Deferred surfaces render placeholders, not invented counts.
    expect(within(drawer).getByTestId('aa-workload-defer')).toBeInTheDocument();
    expect(within(drawer).getByTestId('aa-findings-defer')).toBeInTheDocument();
  });

  test('clicking Edit in the slide-over opens the edit form', async () => {
    renderPage({
      permissionState: 'approved',
      managedSystems: [TABLEAU],
      analyticsAreas: [AA_TAB_PM],
    });
    await waitFor(() => {
      expect(screen.getByTestId('aa-row-permission-management')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('aa-row-permission-management'));
    await waitFor(() => {
      expect(screen.getByTestId('aa-edit-button')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('aa-edit-button'));
    await waitFor(() => {
      expect(
        screen.getByTestId('edit-analytics-area-form-permission-management'),
      ).toBeInTheDocument();
    });
  });

  test('New area dialog surfaces the backend envelope on conflict', async () => {
    renderPage({
      permissionState: 'approved',
      managedSystems: [TABLEAU],
      analyticsAreas: [],
      createResponse: {
        status: 409,
        body: { code: 'conflict.parent_archived', message: 'parent is archived' },
      },
    });
    await waitFor(() => {
      expect(screen.getByTestId('aa-new-area-button')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('aa-new-area-button'));
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

  test('non-admin sees the gate, no catalog rendered', async () => {
    renderPage({
      permissionState: 'request_access',
      managedSystems: [],
      analyticsAreas: [],
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Request access' })).toBeInTheDocument();
    });
    expect(screen.queryByTestId('analytics-areas-catalog')).not.toBeInTheDocument();
  });
});
