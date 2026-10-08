// #849: a saved view keeps the inbox search. `savedViewFilter` collects `q`
// from the /vocs URL next to the other filter keys, and `applySavedView`
// restores (or clears) it at the route-search boundary.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ME_QUERY_KEY } from '../../lib/auth/useMe';
import type { AppRouterContext } from '../__root';
import { AuthedLayout, authenticatedBeforeLoad } from '../_authed';

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

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

interface SavedViewRow {
  id: string;
  surface: 'voc';
  name: string;
  filter: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

function savedView(id: string, name: string, filter: Record<string, unknown>): SavedViewRow {
  return {
    id,
    surface: 'voc',
    name,
    filter,
    created_at: '2026-10-08T00:00:00.000Z',
    updated_at: '2026-10-08T00:00:00.000Z',
  };
}

interface HarnessOptions {
  initialPath: string;
  savedViews?: SavedViewRow[];
}

function mountSavedViewHarness({ initialPath, savedViews = [] }: HarnessOptions) {
  const requests: Array<{ method: string; url: string; body?: unknown }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    requests.push({ method, url, ...(body !== undefined ? { body } : {}) });
    if (method === 'POST' && url === '/saved-views') {
      const input = body as { name: string; filter: Record<string, unknown> };
      return jsonResponse(200, savedView('view-new', input.name, input.filter));
    }
    if (method === 'GET' && url === '/saved-views?surface=voc') {
      return jsonResponse(200, { items: savedViews });
    }
    if (url === '/me') return jsonResponse(200, ME);
    if (url === '/managed-systems') return jsonResponse(200, { items: [], total: 0 });
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
  const vocsRoute = createRoute({
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
  });

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return { requests, router };
}

function postsToSavedViews(requests: Array<{ method: string; url: string; body?: unknown }>) {
  return requests.filter(
    (request): request is { method: 'POST'; url: string; body: Record<string, unknown> } =>
      request.method === 'POST' && request.url === '/saved-views',
  );
}

describe('#849 saved views keep the inbox search', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('saving from a URL with q=voc-1 sends a filter containing q', async () => {
    const { requests } = mountSavedViewHarness({ initialPath: '/vocs?view=inbox&q=voc-1' });
    fireEvent.change(await screen.findByLabelText('저장된 보기 이름'), {
      target: { value: '검색 보기' },
    });
    fireEvent.click(screen.getByTestId('saved-view-save'));

    await waitFor(() => expect(postsToSavedViews(requests)).toHaveLength(1));
    expect(postsToSavedViews(requests)[0]?.body).toMatchObject({
      surface: 'voc',
      name: '검색 보기',
      filter: { q: 'voc-1' },
    });
  });

  it('applying a view with q navigates with q', async () => {
    const { router } = mountSavedViewHarness({
      initialPath: '/vocs?view=inbox',
      savedViews: [savedView('view-1', '검색 보기', { view: 'inbox', q: 'voc-1' })],
    });
    fireEvent.click(await screen.findByTestId('saved-view-apply-view-1'));

    await waitFor(() => {
      const search = new URLSearchParams(router.state.location.searchStr);
      expect(search.get('q')).toBe('voc-1');
    });
  });

  it('applying a view without q clears the current search', async () => {
    const { router } = mountSavedViewHarness({
      initialPath: '/vocs?view=inbox&q=stale-search',
      savedViews: [savedView('view-2', '기본 보기', { view: 'inbox' })],
    });
    fireEvent.click(await screen.findByTestId('saved-view-apply-view-2'));

    await waitFor(() => {
      const search = new URLSearchParams(router.state.location.searchStr);
      expect(search.get('q')).toBeNull();
      expect(search.get('view')).toBe('inbox');
    });
  });
});
