// /admin/analytics-areas URL-state tests (issue #397).
//
// Filters + selection are URL state (docs/frontend/routes-and-layout.md
// §URL State Rules): ?managedSystem=:uuid&includeArchived=true&selected=:uuid.
// Verifies restore-on-load, push-on-select with working Back, atomic
// filter-change + selection-drop, replace-away of a stale selection, and
// clear-filters removing every key in one navigation.
//
// Harness: createRoute + memory history with the route's own search schema
// (same pattern as __tests__/vocs.test.tsx and analytics-areas.test.tsx).

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

import { AnalyticsAreasAdminPage, analyticsAreasSearchSchema } from './analytics-areas';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// uuid-shaped ids — the search schema rejects non-uuid values.
const MS_TAB_ID = '11111111-1111-4111-8111-111111111111';
const GHOST_MS_ID = '22222222-2222-4222-8222-222222222222';
const AA_PM_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const GHOST_AA_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STALE_AA_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function buildHarness({ initialPath }: { initialPath: string }) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: '/admin/analytics-areas',
    validateSearch: (raw) => analyticsAreasSearchSchema.parse(raw),
    component: AnalyticsAreasAdminPage,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([route]),
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
  id: MS_TAB_ID,
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

const AA_PM = {
  id: AA_PM_ID,
  workspace_id: 'ws',
  managed_system_id: MS_TAB_ID,
  slug: 'permission-management',
  name: 'PM Tableau',
  owner_team_id: 'team-1',
  archived_at: null,
  archived_by_actor_id: null,
  created_at: '2026-05-17T00:00:00Z',
  updated_at: '2026-05-17T00:00:00Z',
};

// Area of a Managed System the actor's system list does not contain: renders
// the filter-empty state while the selected area itself still resolves.
const GHOST_AA = {
  ...AA_PM,
  id: GHOST_AA_ID,
  managed_system_id: GHOST_MS_ID,
  slug: 'ghost',
  name: 'Ghost Area',
};

interface FetchCase {
  managedSystems: Array<Record<string, unknown>>;
  analyticsAreas: Array<Record<string, unknown>>;
}

function installFetch(c: FetchCase) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/me/permissions/check')) {
      return jsonResponse({
        state: 'approved',
        decision: { allow: true, via: 'role', requestable: null },
      });
    }
    if (url.includes('/actors/resolve')) {
      return jsonResponse({ actors: [], teams: [] });
    }
    if (url.includes('/managed-systems') && (!init?.method || init.method === 'GET')) {
      const query = new URL(url, 'http://localhost').searchParams;
      const items =
        query.get('include_archived') === 'true'
          ? c.managedSystems
          : c.managedSystems.filter((system) => system.archived_at === null);
      return jsonResponse({ items, total: items.length });
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
    return new Response('not mocked', { status: 500 });
  }) as typeof globalThis.fetch;
}

function renderUrlState(c: FetchCase, initialPath: string) {
  installFetch(c);
  const { router, qc } = buildHarness({ initialPath });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('/admin/analytics-areas URL state', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('?selected=<id> opens that area after load and keeps the list context', async () => {
    const router = renderUrlState(
      { managedSystems: [TABLEAU], analyticsAreas: [AA_PM] },
      `/admin/analytics-areas?selected=${AA_PM_ID}`,
    );
    const drawer = await screen.findByTestId('aa-slide-over');
    expect(within(drawer).getAllByText('PM Tableau').length).toBeGreaterThanOrEqual(1);
    // List rendered alongside the detail — restore is not detail-only.
    expect(screen.getByTestId('aa-row-permission-management')).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ selected: AA_PM_ID });
  });

  test('row click pushes selected and Back returns to no selection', async () => {
    const router = renderUrlState(
      { managedSystems: [TABLEAU], analyticsAreas: [AA_PM] },
      '/admin/analytics-areas',
    );
    await waitFor(() =>
      expect(screen.getByTestId('aa-row-permission-management')).toBeInTheDocument(),
    );
    const lengthBefore = router.history.length;

    fireEvent.click(screen.getByTestId('aa-row-permission-management'));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ selected: AA_PM_ID });
    });
    expect(screen.getByTestId('aa-slide-over')).toBeInTheDocument();
    expect(router.history.length).toBe(lengthBefore + 1);

    router.history.back();
    await waitFor(() => {
      expect(screen.queryByTestId('aa-slide-over')).not.toBeInTheDocument();
    });
    expect(router.state.location.search).toEqual({});
    // Rows still rendered → the closed-panel assertion is not vacuous.
    expect(screen.getByTestId('aa-row-permission-management')).toBeInTheDocument();
  });

  test('changing the MS filter drops selected in the same navigation', async () => {
    // Two systems; the selected area belongs to Tableau (about to be filtered out).
    const POWERBI = {
      ...TABLEAU,
      id: GHOST_MS_ID,
      slug: 'power-bi',
      name: 'Power BI',
    };
    const AA_SALES = {
      ...AA_PM,
      managed_system_id: GHOST_MS_ID,
      slug: 'sales',
      name: 'Sales Power BI',
    };
    const router = renderUrlState(
      { managedSystems: [TABLEAU, POWERBI], analyticsAreas: [AA_PM, AA_SALES] },
      `/admin/analytics-areas?selected=${AA_PM_ID}`,
    );
    await waitFor(() => expect(screen.getByTestId('aa-slide-over')).toBeInTheDocument());
    const lengthBefore = router.history.length;

    fireEvent.click(screen.getByTestId('aa-filter-button'));
    fireEvent.click(screen.getByTestId('aa-filter-managed-system'));
    fireEvent.click(await screen.findByRole('option', { name: 'Power BI' }));

    // One push lands on the new filter with no selected key.
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ managedSystem: GHOST_MS_ID });
    });
    expect(router.history.length).toBe(lengthBefore + 1);
    await waitFor(() => expect(screen.getByTestId('aa-row-sales')).toBeInTheDocument());
    expect(screen.queryByTestId('aa-row-permission-management')).not.toBeInTheDocument();
    expect(screen.queryByTestId('aa-slide-over')).not.toBeInTheDocument();
  });

  test('stale selected uuid not in the list is replaced away after load', async () => {
    const router = renderUrlState(
      { managedSystems: [TABLEAU], analyticsAreas: [AA_PM] },
      `/admin/analytics-areas?selected=${STALE_AA_ID}`,
    );
    await waitFor(() =>
      expect(screen.getByTestId('aa-row-permission-management')).toBeInTheDocument(),
    );
    await waitFor(() => {
      expect(router.state.location.search).toEqual({});
    });
    // Replaced, not pushed: history did not grow.
    expect(router.history.length).toBe(1);
    expect(screen.queryByTestId('aa-slide-over')).not.toBeInTheDocument();
    expect(screen.getByTestId('aa-row-permission-management')).toBeInTheDocument();
  });

  test('clear-filters removes managedSystem, includeArchived and selected in one navigation', async () => {
    const router = renderUrlState(
      { managedSystems: [TABLEAU], analyticsAreas: [AA_PM, GHOST_AA] },
      `/admin/analytics-areas?managedSystem=${GHOST_MS_ID}&includeArchived=true&selected=${GHOST_AA_ID}`,
    );
    // Filter-empty state is rendered (filtered MS is not in the system list)
    // while the selected area still resolves, so nothing is reconciled away.
    await screen.findByTestId('aa-clear-filters');
    const lengthBefore = router.history.length;

    fireEvent.click(screen.getByTestId('aa-clear-filters'));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({});
    });
    expect(router.history.length).toBe(lengthBefore + 1);
    await waitFor(() => expect(screen.getByTestId(`aa-group-${MS_TAB_ID}`)).toBeInTheDocument());
    expect(screen.getByTestId('aa-row-permission-management')).toBeInTheDocument();
    expect(screen.queryByTestId('aa-slide-over')).not.toBeInTheDocument();
  });
});
