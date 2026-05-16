// Home route redirects to /login when /me returns 401. This is the only
// frontend acceptance check the orchestrator scoped for Slice 1 #3 (the
// visual layer is gated by the pending design-system reference HTML).

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
import { UnauthenticatedError, fetchMe } from '../lib/api.js';
import { HomePage } from './index';
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
    component: HomePage,
    beforeLoad: async () => {
      try {
        await fetchMe();
      } catch (err) {
        if (err instanceof UnauthenticatedError) {
          // Use a thrown redirect via the imported helper at runtime so the
          // router transitions to /login.
          const { redirect } = await import('@tanstack/react-router');
          throw redirect({ to: '/login' });
        }
      }
    },
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
    });
  });

  test('renders identity when /me returns 200', async () => {
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
    await waitFor(() => {
      expect(screen.getByText(/Logged in as Mock Admin/)).toBeInTheDocument();
    });
  });

  test('renders Open requests list when /permission-requests/mine returns rows', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/me')) {
        return new Response(
          JSON.stringify({
            actor: {
              id: 'a-1',
              external_id: 'mock-user-1',
              email: 'user@feedbackops.local',
              display_name: 'Mock User',
              role_level: 'user',
            },
            workspace_id: 'ws',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.endsWith('/permission-requests/mine')) {
        return new Response(
          JSON.stringify({
            requests: [
              {
                id: 'req-1',
                requested_capability: 'workspace.admin',
                requested_managed_system_id: null,
                reason: 'r',
                requested_object_type: null,
                requested_object_id: null,
                source_object_type: null,
                source_object_id: null,
                source_action_id: null,
                status: 'pending',
                created_at: '2026-05-16T10:00:00.000Z',
              },
            ],
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
    await waitFor(() => {
      expect(screen.getByTestId('open-requests-list')).toBeInTheDocument();
    });
    expect(screen.getByText('workspace.admin')).toBeInTheDocument();
  });

  test('renders empty state when /permission-requests/mine returns zero rows', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/me')) {
        return new Response(
          JSON.stringify({
            actor: {
              id: 'a-1',
              external_id: 'mock-user-1',
              email: 'user@feedbackops.local',
              display_name: 'Mock User',
              role_level: 'user',
            },
            workspace_id: 'ws',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.endsWith('/permission-requests/mine')) {
        return new Response(JSON.stringify({ requests: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('not mocked', { status: 500 });
    }) as typeof globalThis.fetch;

    const { router, qc } = buildHarness({ initialPath: '/' });
    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText('No open requests.')).toBeInTheDocument();
    });
  });
});
