// /admin/managed-systems route tests (issue #87 registry rebuild).
// Verifies admin sees the registry + header actions, non-admin sees the
// PermissionGate fallback, the registry renders rows with owner chips +
// analytics-area pills, the requests panel shows the live count, and the
// register dialog surfaces backend envelopes.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { ManagedSystemsAdminPage } from './managed-systems';

function buildHarness({ initialPath }: { initialPath: string }) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/admin/managed-systems',
    component: ManagedSystemsAdminPage,
  });
  // Stub target for the "Open review console" / "Review" links.
  const reqRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/admin/permissions/requests',
    component: () => <div>requests console</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, reqRoute]),
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

interface FetchCase {
  permissionState: 'approved' | 'request_access' | 'blocked_non_requestable';
  managedSystems: Array<Record<string, unknown>>;
  analyticsAreas?: Array<Record<string, unknown>>;
  resolve?: { actors: unknown[]; teams: unknown[] };
  requestsCount?: number;
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
    if (url.includes('/actors/resolve')) {
      return jsonResponse(c.resolve ?? { actors: [], teams: [] });
    }
    if (url.includes('/analytics-areas')) {
      return jsonResponse({
        items: c.analyticsAreas ?? [],
        total: (c.analyticsAreas ?? []).length,
      });
    }
    if (url.endsWith('/permission-requests') && (!init?.method || init.method === 'GET')) {
      return jsonResponse({ requests: [], count: c.requestsCount ?? 0 });
    }
    if (url.includes('/managed-systems') && init?.method === 'POST') {
      const r = c.createResponse ?? { status: 201, body: c.managedSystems[0] };
      return jsonResponse(r.body, r.status);
    }
    if (url.includes('/managed-systems')) {
      return jsonResponse({ items: c.managedSystems, total: c.managedSystems.length });
    }
    return new Response('not mocked', { status: 500 });
  }) as typeof globalThis.fetch;
}

const TABLEAU = {
  id: 'ms-1',
  workspace_id: 'ws',
  slug: 'tableau',
  name: 'Tableau',
  external_key: null,
  default_owner_actor_id: 'actor-1',
  default_owner_team_id: null,
  archived_at: null,
  archived_by_actor_id: null,
  created_at: '2026-05-17T00:00:00Z',
  updated_at: '2026-05-17T00:00:00Z',
};

describe('/admin/managed-systems route', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function renderRoute() {
    const { router, qc } = buildHarness({ initialPath: '/admin/managed-systems' });
    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
  }

  test('admin sees the registry, owner chip, area pill, and requests count', async () => {
    installFetch({
      permissionState: 'approved',
      managedSystems: [TABLEAU],
      analyticsAreas: [
        {
          id: 'aa-1',
          workspace_id: 'ws',
          managed_system_id: 'ms-1',
          slug: 'revenue',
          name: 'Revenue',
          owner_team_id: null,
          archived_at: null,
          archived_by_actor_id: null,
          created_at: '2026-05-17T00:00:00Z',
          updated_at: '2026-05-17T00:00:00Z',
        },
      ],
      resolve: { actors: [{ id: 'actor-1', display_name: '김지원', email: 'k@x.com' }], teams: [] },
      requestsCount: 3,
    });
    renderRoute();

    await waitFor(() => {
      expect(screen.getByTestId('managed-systems-registry')).toBeInTheDocument();
    });
    expect(screen.getByTestId('managed-system-row-tableau')).toBeInTheDocument();
    expect(screen.getByText('managed-system/tableau')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('김지원')).toBeInTheDocument());
    expect(screen.getByText('Revenue')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('ms-requests-count')).toHaveTextContent(
        '3 requests awaiting decision',
      ),
    );
    expect(screen.getByTestId('ms-register-button')).toBeInTheDocument();
  });

  test('non-admin sees the gate, no registry rendered', async () => {
    installFetch({ permissionState: 'request_access', managedSystems: [] });
    renderRoute();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Request access' })).toBeInTheDocument();
    });
    expect(screen.queryByTestId('managed-systems-registry')).not.toBeInTheDocument();
  });

  test('register dialog surfaces the duplicate-slug envelope', async () => {
    installFetch({
      permissionState: 'approved',
      managedSystems: [],
      createResponse: {
        status: 409,
        body: { code: 'conflict.duplicate_slug', message: 'slug already in use' },
      },
    });
    renderRoute();

    await waitFor(() => expect(screen.getByTestId('ms-register-button')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('ms-register-button'));
    await waitFor(() =>
      expect(screen.getByTestId('create-managed-system-form')).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByTestId('create-slug'), { target: { value: 'tableau' } });
    fireEvent.change(screen.getByTestId('create-name'), { target: { value: 'dup' } });
    fireEvent.click(screen.getByTestId('create-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('create-error')).toHaveTextContent(/conflict\.duplicate_slug/);
    });
  });
});
