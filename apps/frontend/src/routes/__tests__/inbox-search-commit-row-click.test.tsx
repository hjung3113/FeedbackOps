// #864: mousedown on a row blurs the search box, and the blur commit writes q
// before click. Without placeholder data the new list query has no cache, the
// rows swap for skeletons, and the click never writes `selected`. This drives
// the real inbox. The next list request is left pending so the failure does
// not depend on a fast response. The 300 ms debounce is frozen and not advanced.

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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ME_QUERY_KEY } from '../../lib/auth/useMe';
import { parseAppSearch, stringifyAppSearch } from '../../lib/router/search-serialization';
import type { AppRouterContext } from '../__root';
import { AuthedLayout, authenticatedBeforeLoad } from '../_authed';
import { VocRouteShell, validateVocSearch } from '../_authed/vocs';

const ROW_ID = '00000000-0000-4000-8000-000000000008';

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

const ROW = {
  id: ROW_ID,
  display_id: 'VOC-SEED-08',
  title: '시드 행',
  primary_managed_system_id: '00000000-0000-4000-8000-0000000000aa',
  analytics_area_id: null,
  reporter_id: '00000000-0000-4000-8000-0000000000bb',
  owner_user_id: null,
  owner_team_id: null,
  severity: 'high' as const,
  reporter_facing_status: 'received' as const,
  triage_state: 'untriaged' as const,
  source_context: 'direct_use' as const,
  created_at: '2026-10-08T00:00:00.000Z',
  updated_at: '2026-10-08T00:00:00.000Z',
  similar_count: 0,
  attachment_count: 0,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function hang(): Promise<Response> {
  return new Promise(() => {});
}

function mountInbox() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (method === 'GET' && url.startsWith('/vocs?')) {
      const q = new URL(url, 'http://localhost').searchParams.get('q');
      // The committed draft has no cached page. Leave it pending.
      if (q !== null) return hang();
      return jsonResponse(200, { items: [ROW] });
    }
    if (method === 'GET' && url.startsWith('/vocs/')) return hang();
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
    if (url.startsWith('/saved-views')) return jsonResponse(200, { items: [] });
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
    validateSearch: validateVocSearch,
    component: VocRouteShell,
  });
  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
    component: () => <p>Login destination</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([authedRoute.addChildren([vocsRoute]), loginRoute]),
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: ['/vocs?view=inbox'] }),
    parseSearch: parseAppSearch,
    stringifySearch: stringifyAppSearch,
  });

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return { router };
}

describe('#864 a row click while a search draft is pending still selects the row', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('writes selected when pointerdown, mousedown, blur, mouseup and click land before the debounce', async () => {
    const { router } = mountInbox();
    const box = await screen.findByRole('searchbox', { name: '필터, 키워드…' });
    const row = (await screen.findByText('VOC-SEED-08')).closest('[role="row"]');
    expect(row).not.toBeNull();
    if (row === null) return;

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    try {
      box.focus();
      fireEvent.change(box, { target: { value: 'voc-0' } });
      fireEvent.pointerDown(row);
      fireEvent.mouseDown(row);
      fireEvent.blur(box);
      // The browser flushes the blur commit's navigation before mouseup/click.
      // That is the gap where a cache miss detaches the row.
      await act(async () => {});
      fireEvent.mouseUp(row);
      fireEvent.click(row);
      await act(async () => {});

      const search = router.state.location.search as { selected?: string };
      expect(search.selected).toBe(ROW_ID);
    } finally {
      vi.useRealTimers();
    }
  });
});
