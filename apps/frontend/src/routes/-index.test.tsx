// The root entry route authenticates, then sends the actor into the AppFrame
// at /home. It never renders a legacy standalone screen.

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
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { rootBeforeLoad } from './index';
import { LoginPage } from './login';

// We rebuild the route options here rather than importing the file route's
// runtime beforeLoad — TanStack's createFileRoute carries generated type
// brands that can't be re-attached to a createRoute call. The behaviour is
// identical: hit /me, redirect to /login on 401.
function buildHarness({ initialPath }: { initialPath: string }) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <p>Root entry</p>,
    beforeLoad: rootBeforeLoad,
  });
  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
    component: LoginPage,
  });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/home',
    component: () => <p>Authenticated home</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, loginRoute, homeRoute]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { router, qc };
}

describe('home route auth gate', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Default: /me returns 401 (unauthenticated visitor).
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/me')) {
        return new Response(JSON.stringify({ code: 'auth.session_invalid' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('not mocked', { status: 500 });
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('redirects to /login when /me returns 401', async () => {
    const { router, qc } = buildHarness({ initialPath: '/' });
    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    // The login page renders the mock-login heading.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Mock login' })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/login');
    });
  });

  test('redirects to /home when /me returns 200 without fetching permission requests', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/me')) {
        return new Response(
          JSON.stringify({
            actor: {
              id: '00000000-0000-0000-0000-000000000001',
              external_id: 'mock-admin-1',
              email: 'admin@feedbackops.local',
              display_name: 'Mock Admin',
              role_level: 'admin',
            },
            workspace_id: '11111111-1111-1111-1111-111111111111',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('not mocked', { status: 500 });
    }) as typeof globalThis.fetch;

    const { router, qc } = buildHarness({ initialPath: '/' });
    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/home'));
    expect(screen.getByText('Authenticated home')).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalledWith(
      '/permission-requests/mine',
      expect.anything(),
    );
  });
});
