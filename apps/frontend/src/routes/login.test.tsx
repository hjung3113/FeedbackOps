// /login route guards per F-015:
//   - DEV (default in vitest): renders the mock-login picker including the
//     seed roster external_ids.
//   - PROD (import.meta.env.PROD): renders nothing user-facing; redirects
//     to home. Seed roster strings must not leak.

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
import { afterEach, describe, expect, test, vi } from 'vitest';
import { HomePage } from './index';
import { LoginPage } from './login';

function buildHarness({ initialPath }: { initialPath: string }) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: HomePage,
  });
  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
    component: LoginPage,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, loginRoute]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { router, qc };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('/login dev (mock auth)', () => {
  test('renders mock-login picker with seed actors', async () => {
    // Default vitest env: PROD=false. No stub needed.
    globalThis.fetch = vi.fn(async () => new Response('not mocked', { status: 500 })) as typeof globalThis.fetch;

    const { router, qc } = buildHarness({ initialPath: '/login' });
    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Mock login' })).toBeInTheDocument();
    });
    expect(screen.getByText(/Admin One/)).toBeInTheDocument();
    expect(screen.getByText(/User One/)).toBeInTheDocument();
  });
});

describe('/login prod guard (F-015)', () => {
  test('redirects to / and does not render seed roster strings', async () => {
    vi.stubEnv('PROD', true);
    // Home component reads /me on mount via its own hooks — return 401 so it
    // renders the unauthenticated branch deterministically. The assertion
    // we care about is the absence of the picker, not the home content.
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ code: 'auth.session_invalid' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
    ) as typeof globalThis.fetch;

    const { router, qc } = buildHarness({ initialPath: '/login' });
    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    expect(screen.queryByRole('heading', { name: 'Mock login' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Admin One/)).not.toBeInTheDocument();
    expect(screen.queryByText(/User One/)).not.toBeInTheDocument();
    expect(screen.queryByText(/mock-admin-1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/mock-user-1/)).not.toBeInTheDocument();
  });
});
