import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { fireEvent, render, screen } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MeRequestError } from '@/lib/api/auth';
import { ME_QUERY_KEY } from '@/lib/auth/useMe';
import type { AppRouterContext } from '@/routes/__root';
import {
  AuthenticatedRouteErrorFallback,
  RouteErrorFallback,
  RouteNotFoundFallback,
} from './RouteFallback';

vi.mock('./AppFrame', () => ({
  AppFrame: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-frame">{children}</div>
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
) {
  const rootRoute = createRootRouteWithContext<AppRouterContext>()({
    component: () => <Outlet />,
  });
  const authenticatedRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: '_authed',
    beforeLoad: async () => {
      if (authenticatedError !== undefined) throw authenticatedError;
    },
    component: () => (
      <div data-testid="app-frame">
        <Outlet />
      </div>
    ),
    errorComponent: AuthenticatedRouteErrorFallback,
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
    expect(screen.getByRole('link', { name: '홈으로' })).toHaveAttribute('href', '/home');
    expect(screen.getByRole('button', { name: '뒤로' })).toBeInTheDocument();
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
    expect(screen.getByText('화면을 표시하는 중 문제가 발생했습니다.')).toBeInTheDocument();
    expect(screen.queryByText('private loader details')).not.toBeInTheDocument();
    expect(screen.getByTestId('app-frame')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(await screen.findByText('Recovered route')).toBeInTheDocument();
  });

  it('maps a typed /me rate-limit error to the localized retry state', async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(ME_QUERY_KEY, ME);
    const router = buildRouter(
      queryClient,
      '/broken',
      async () => undefined,
      new MeRequestError(429, '0'),
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    renderRouter(router, queryClient);

    expect(await screen.findByText('로그인 상태를 확인할 수 없습니다')).toBeInTheDocument();
    expect(screen.getByText('잠시 후 다시 시도하세요.')).toBeInTheDocument();
    expect(screen.getByTestId('app-frame')).toBeInTheDocument();
  });
});
