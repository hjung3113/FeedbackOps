// /admin/managed-systems route tests (Slice 2 #10).
// Verifies admin sees the list + form, non-admin sees the PermissionGate
// fallback, and create-form errors surface the backend envelope.

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

interface FetchCase {
  permissionState: 'approved' | 'request_access' | 'blocked_non_requestable';
  managedSystems: Array<Record<string, unknown>>;
  createResponse?: { status: number; body: unknown };
}

function installFetch(c: FetchCase) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/me/permissions/check') || url.includes('/me/permissions/check?')) {
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
    if (url.includes('/managed-systems') && init?.method === 'POST') {
      const r = c.createResponse ?? { status: 201, body: c.managedSystems[0] };
      return jsonResponse(r.body, r.status);
    }
    return new Response('not mocked', { status: 500 });
  }) as typeof globalThis.fetch;
}

describe('/admin/managed-systems route', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('admin sees the create form and the seeded rows', async () => {
    installFetch({
      permissionState: 'approved',
      managedSystems: [
        {
          id: 'ms-1',
          workspace_id: 'ws',
          slug: 'tableau',
          name: 'Tableau',
          external_key: null,
          default_owner_actor_id: 'admin-actor',
          default_owner_team_id: null,
          archived_at: null,
          archived_by_actor_id: null,
          created_at: '2026-05-17T00:00:00Z',
          updated_at: '2026-05-17T00:00:00Z',
        },
      ],
    });
    const { router, qc } = buildHarness({ initialPath: '/admin/managed-systems' });
    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('create-managed-system-form')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId('managed-systems-table')).toBeInTheDocument();
    });
    expect(screen.getByTestId('managed-system-row-tableau')).toBeInTheDocument();
  });

  test('non-admin sees the gate, no create form rendered', async () => {
    installFetch({
      permissionState: 'request_access',
      managedSystems: [],
    });
    const { router, qc } = buildHarness({ initialPath: '/admin/managed-systems' });
    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Request access' })).toBeInTheDocument();
    });
    expect(screen.queryByTestId('create-managed-system-form')).not.toBeInTheDocument();
  });

  test('duplicate-slug response surfaces the backend envelope code', async () => {
    installFetch({
      permissionState: 'approved',
      managedSystems: [],
      createResponse: {
        status: 409,
        body: { code: 'conflict.duplicate_slug', message: 'slug already in use' },
      },
    });
    const { router, qc } = buildHarness({ initialPath: '/admin/managed-systems' });
    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('create-managed-system-form')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('create-slug'), { target: { value: 'tableau' } });
    fireEvent.change(screen.getByTestId('create-name'), { target: { value: 'dup' } });
    fireEvent.click(screen.getByTestId('create-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('create-error')).toHaveTextContent(/conflict\.duplicate_slug/);
    });
  });
});
