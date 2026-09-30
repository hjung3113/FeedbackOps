import { QueryClient } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ME_QUERY_KEY } from '../../lib/auth/useMe';
import type { AppRouterContext } from '../__root';
import { authenticatedBeforeLoad } from '../_authed';

const ME = {
  actor: {
    id: 'actor-1',
    external_id: 'mock-admin-1',
    email: 'admin@example.test',
    display_name: 'Mock Admin',
    role_level: 'admin',
  },
  workspace_id: 'workspace-1',
};

function jsonResponse(status: number, body: unknown, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function buildRouter(queryClient: QueryClient, initialPath: string) {
  const rootRoute = createRootRouteWithContext<AppRouterContext>()({
    component: () => <Outlet />,
  });
  const authedRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: '_authed',
    beforeLoad: authenticatedBeforeLoad,
    component: () => <Outlet />,
  });
  const homeRoute = createRoute({
    getParentRoute: () => authedRoute,
    path: '/home',
    component: () => <p>Authenticated home</p>,
  });
  const tasksRoute = createRoute({
    getParentRoute: () => authedRoute,
    path: '/tasks',
    component: () => <p>Authenticated tasks</p>,
  });
  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
    component: () => <p>Login destination</p>,
  });

  return createRouter({
    routeTree: rootRoute.addChildren([
      authedRoute.addChildren([homeRoute, tasksRoute]),
      loginRoute,
    ]),
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
}

describe('authenticated route identity cache', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('does not request /me when navigating between routes with a warm cache', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(ME_QUERY_KEY, ME);
    globalThis.fetch = vi.fn() as typeof globalThis.fetch;
    const router = buildRouter(queryClient, '/home');

    render(<RouterProvider router={router} />);
    expect(await screen.findByText('Authenticated home')).toBeInTheDocument();
    await act(async () => {
      await router.navigate({ to: '/tasks' });
    });
    await authenticatedBeforeLoad({ context: { queryClient }, location: { href: '/tasks' } });

    expect(screen.getByText('Authenticated tasks')).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('recovers from /me 429 on retry and renders the authed route', async () => {
    const queryClient = new QueryClient();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, {}, { 'retry-after': '0' }))
      .mockResolvedValueOnce(jsonResponse(200, ME));
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    const router = buildRouter(queryClient, '/home');

    render(<RouterProvider router={router} />);

    expect(await screen.findByText('Authenticated home')).toBeInTheDocument();
    expect(screen.queryByText(/\/me failed: 429/)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(queryClient.getQueryData(ME_QUERY_KEY)).toEqual(ME);
  });

  it('redirects to /login when /me returns 401', async () => {
    const queryClient = new QueryClient();
    globalThis.fetch = vi.fn(async () => jsonResponse(401, {})) as typeof globalThis.fetch;
    const router = buildRouter(queryClient, '/home');

    render(<RouterProvider router={router} />);

    expect(await screen.findByText('Login destination')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toMatchObject({ redirectTo: '/home' });
  });

  it('requests /me on the next authed entry after the identity cache is cleared', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(ME_QUERY_KEY, ME);
    globalThis.fetch = vi.fn(async () => jsonResponse(200, ME)) as typeof globalThis.fetch;
    const router = buildRouter(queryClient, '/home');

    render(<RouterProvider router={router} />);
    expect(await screen.findByText('Authenticated home')).toBeInTheDocument();
    await act(async () => {
      await router.navigate({ to: '/login' });
    });
    queryClient.clear();
    await act(async () => {
      await router.navigate({ to: '/home' });
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Authenticated home')).toBeInTheDocument();
  });
});
