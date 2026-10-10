// Shared harness for tests that mount an authenticated router at /vocs
// (#882). It owns the route tree (root → _authed → /vocs + /login), the `ME`
// fixture, the fetch stub and its shared defaults; per-test branches go
// through `handle`, which runs before the shared defaults.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { ME_QUERY_KEY } from '../lib/auth/useMe';
import { parseAppSearch, stringifyAppSearch } from '../lib/router/search-serialization';
import type { AppRouterContext } from '../routes/__root';
import { AuthedLayout, authenticatedBeforeLoad } from '../routes/_authed';
import { VocRouteShell, validateVocSearch } from '../routes/_authed/vocs';

export const ME = {
  actor: {
    id: 'actor-1',
    external_id: 'mock-admin-1',
    email: 'admin@example.test',
    display_name: 'Mock Admin',
    role_level: 'admin',
  },
  workspace_id: 'workspace-1',
};

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export interface SavedViewRow {
  id: string;
  surface: 'voc';
  name: string;
  filter: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export function savedView(id: string, name: string, filter: Record<string, unknown>): SavedViewRow {
  return {
    id,
    surface: 'voc',
    name,
    filter,
    created_at: '2026-10-08T00:00:00.000Z',
    updated_at: '2026-10-08T00:00:00.000Z',
  };
}

export interface AuthedVocsRequest {
  url: string;
  method: string;
  body?: unknown;
}

export interface MountAuthedVocsOptions {
  initialPath: string;
  /**
   * Mount the real inbox shell (VocRouteShell + validateVocSearch) at /vocs
   * instead of the inert placeholder. The shell is only useful together with
   * its validateSearch, so they are one switch.
   */
  vocsShell?: boolean;
  /**
   * Per-test fetch branch; runs before the shared defaults. Return undefined
   * to fall through to them.
   */
  handle?: (request: AuthedVocsRequest) => Response | Promise<Response> | undefined;
}

export function mountAuthedVocs({
  initialPath,
  vocsShell = false,
  handle,
}: MountAuthedVocsOptions) {
  const requests: AuthedVocsRequest[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    const request: AuthedVocsRequest = { url, method, ...(body !== undefined ? { body } : {}) };
    requests.push(request);
    if (handle) {
      const handled = await handle(request);
      if (handled !== undefined) return handled;
    }
    if (url === '/me') return jsonResponse(200, ME);
    if (url.startsWith('/managed-systems')) return jsonResponse(200, { items: [], total: 0 });
    if (url.startsWith('/analytics-areas')) return jsonResponse(200, { items: [] });
    if (url.startsWith('/actors')) return jsonResponse(200, { items: [] });
    if (url.startsWith('/nav/counts')) return jsonResponse(200, { counts: {} });
    if (url.startsWith('/me/permissions/check')) {
      return jsonResponse(200, { state: 'approved', decision: { allow: true, via: 'role' } });
    }
    if (url.startsWith('/notifications?')) {
      return jsonResponse(200, { items: [], page: { has_more: false }, unread_count: 0 });
    }
    return jsonResponse(200, {});
  });
  vi.stubGlobal('fetch', fetchMock as typeof globalThis.fetch);

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(ME_QUERY_KEY, ME);

  const rootRoute = createRootRouteWithContext<AppRouterContext>()({
    component: () => <Outlet />,
  });
  const authedRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: '_authed',
    beforeLoad: authenticatedBeforeLoad,
    component: AuthedLayout,
  });
  const vocsRoute = vocsShell
    ? createRoute({
        getParentRoute: () => authedRoute,
        path: '/vocs',
        validateSearch: validateVocSearch,
        component: VocRouteShell,
      })
    : createRoute({
        getParentRoute: () => authedRoute,
        path: '/vocs',
        component: () => <p>VOC inbox</p>,
      });
  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
    component: () => <p>Login destination</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([authedRoute.addChildren([vocsRoute]), loginRoute]),
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [initialPath] }),
    parseSearch: parseAppSearch,
    stringifySearch: stringifyAppSearch,
  });

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return { requests, router };
}
