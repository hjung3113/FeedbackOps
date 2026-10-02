import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ME_QUERY_KEY, ensureMe } from '@/lib/auth/useMe';
import { createAppRouter } from '@/lib/router/app-router';
import type { AppRouterContext } from '@/routes/__root';
import {
  AuthenticatedRouteErrorFallback,
  AuthenticatedRoutePendingFallback,
  RouteErrorFallback,
  RouteNotFoundFallback,
} from './RouteFallback';

vi.mock('./AppFrame', () => ({
  AppFrame: ({
    children,
    sidebarEntries = [],
  }: {
    children: React.ReactNode;
    sidebarEntries?: Array<{ id: string; label: string }>;
  }) => (
    <div data-testid="app-frame">
      <nav aria-label="fallback navigation">
        {sidebarEntries.map((entry) => (
          <div key={entry.id} data-testid={`fallback-sidebar-nav-${entry.id}`}>
            {entry.label}
          </div>
        ))}
      </nav>
      {children}
    </div>
  ),
}));

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

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function buildRouter(
  queryClient: QueryClient,
  initialPath: string,
  brokenLoader: () => Promise<unknown> = async () => undefined,
  authenticatedError?: unknown,
  authenticatedGuard?: () => Promise<void>,
  pendingTimings?: { pendingMs: number; pendingMinMs: number },
) {
  const rootRoute = createRootRouteWithContext<AppRouterContext>()({
    component: () => <Outlet />,
  });
  const authenticatedRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: '_authed',
    beforeLoad: async () => {
      if (authenticatedError !== undefined) throw authenticatedError;
      await authenticatedGuard?.();
    },
    component: () => (
      <div data-testid="app-frame">
        <Outlet />
      </div>
    ),
    errorComponent: AuthenticatedRouteErrorFallback,
    pendingComponent: AuthenticatedRoutePendingFallback,
    ...(pendingTimings ?? {}),
  });
  const homeRoute = createRoute({
    getParentRoute: () => authenticatedRoute,
    path: '/home',
    component: () => <p>Home route</p>,
  });
  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
    component: () => <p>Login route</p>,
  });
  const brokenRoute = createRoute({
    getParentRoute: () => authenticatedRoute,
    path: '/broken',
    loader: brokenLoader,
    component: () => <p>Recovered route</p>,
  });

  return createRouter({
    routeTree: rootRoute.addChildren([
      authenticatedRoute.addChildren([homeRoute, brokenRoute]),
      loginRoute,
    ]),
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [initialPath] }),
    defaultErrorComponent: RouteErrorFallback,
    defaultNotFoundComponent: RouteNotFoundFallback,
  });
}

function renderRouter(router: ReturnType<typeof buildRouter>, queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe('router fallback screens', () => {
  it('renders an authenticated unknown path in the app frame with home and back actions', async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(ME_QUERY_KEY, ME);
    const router = buildRouter(queryClient, '/missing-page');

    renderRouter(router, queryClient);

    expect(await screen.findByText('페이지를 찾을 수 없습니다')).toBeInTheDocument();
    expect(screen.getByTestId('app-frame')).toBeInTheDocument();
    expect(screen.queryByTestId('fallback-sidebar-nav-command')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '홈으로' })).toHaveAttribute('href', '/home');
    expect(screen.getByRole('button', { name: '뒤로' })).toBeInTheDocument();
  });

  it('renders a nested unknown path as a 404 inside the existing app frame', async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(ME_QUERY_KEY, ME);
    const router = buildRouter(queryClient, '/home/extra');

    renderRouter(router, queryClient);

    expect(await screen.findByText('페이지를 찾을 수 없습니다')).toBeInTheDocument();
    expect(screen.getAllByTestId('app-frame')).toHaveLength(1);
  });

  it('uses production route wiring for an unknown path', async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(ME_QUERY_KEY, ME);
    const router = createAppRouter(
      queryClient,
      createMemoryHistory({ initialEntries: ['/missing-page'] }),
    );

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('페이지를 찾을 수 없습니다')).toBeInTheDocument();
    expect(screen.getAllByTestId('app-frame')).toHaveLength(1);
  });

  it('sends an unauthenticated unknown path to login without rendering an app frame', async () => {
    const queryClient = createQueryClient();
    globalThis.fetch = vi.fn(
      async () =>
        new Response('{}', { status: 401, headers: { 'content-type': 'application/json' } }),
    ) as typeof globalThis.fetch;
    const router = buildRouter(queryClient, '/missing-page');
    const navigate = vi.spyOn(router, 'navigate');

    renderRouter(router, queryClient);

    expect(await screen.findByText('Login route')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toMatchObject({ redirectTo: '/missing-page' });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('app-frame')).not.toBeInTheDocument();
  });

  it('shows a pending state while the authenticated guard resolves slowly', async () => {
    const queryClient = createQueryClient();
    let resolveGuard!: () => void;
    const guard = new Promise<void>((resolve) => {
      resolveGuard = resolve;
    });
    const router = buildRouter(
      queryClient,
      '/home',
      async () => undefined,
      undefined,
      () => guard,
      { pendingMs: 0, pendingMinMs: 0 },
    );

    renderRouter(router, queryClient);

    const pendingState = await screen.findByRole('status', {}, { timeout: 3000 });
    expect(pendingState).toHaveTextContent('불러오는 중…');

    await act(async () => resolveGuard());
    expect(await screen.findByText('Home route')).toBeInTheDocument();
  });

  it('shows a localized loader error in the app frame and retries the route', async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(ME_QUERY_KEY, ME);
    let shouldFail = true;
    const router = buildRouter(queryClient, '/broken', async () => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error('private loader details');
      }
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    renderRouter(router, queryClient);

    expect(await screen.findByText('화면을 불러오지 못했습니다')).toBeInTheDocument();
    expect(screen.getByText('잠시 후 다시 시도하세요.')).toBeInTheDocument();
    expect(screen.queryByText('private loader details')).not.toBeInTheDocument();
    expect(screen.getByTestId('app-frame')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(await screen.findByText('Recovered route')).toBeInTheDocument();
  });

  it('maps a typed /me rate-limit error to the localized retry state', async () => {
    const queryClient = createQueryClient();
    let fetchCount = 0;
    const fetchMock = vi.fn(async () => {
      fetchCount += 1;
      if (fetchCount <= 3) {
        return new Response('{}', { status: 429, headers: { 'retry-after': '0' } });
      }
      return new Response(JSON.stringify(ME), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    const router = buildRouter(
      queryClient,
      '/home',
      async () => undefined,
      undefined,
      async () => {
        await ensureMe(queryClient);
      },
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    renderRouter(router, queryClient);

    expect(await screen.findByText('로그인 상태를 확인할 수 없습니다')).toBeInTheDocument();
    expect(screen.getByText('잠시 후 다시 시도하세요.')).toBeInTheDocument();
    expect(screen.queryByTestId('app-frame')).not.toBeInTheDocument();
    const fetchCountAtFallback = fetchMock.mock.calls.length;
    expect(fetchCountAtFallback).toBe(3);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(fetchMock).toHaveBeenCalledTimes(fetchCountAtFallback);

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(await screen.findByText('Home route')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('retries a /me rate limit from an unknown path', async () => {
    const queryClient = createQueryClient();
    let fetchCount = 0;
    const fetchMock = vi.fn(async () => {
      fetchCount += 1;
      if (fetchCount <= 3) {
        return new Response('{}', { status: 429, headers: { 'retry-after': '0' } });
      }
      return new Response(JSON.stringify(ME), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    const router = buildRouter(queryClient, '/missing-page');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    renderRouter(router, queryClient);

    expect(await screen.findByText('로그인 상태를 확인할 수 없습니다')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(await screen.findByText('페이지를 찾을 수 없습니다')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
