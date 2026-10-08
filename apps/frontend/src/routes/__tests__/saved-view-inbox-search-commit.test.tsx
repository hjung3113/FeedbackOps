// #864: the inbox search commits at once on Enter and on blur. #849's UX
// review measured the loss: type a term and save a view within the debounce
// and the view is stored without `q`. This drives the REAL inbox
// (VocRouteShell) and the REAL sidebar saved-view form. After the real-timer
// mount, timers are frozen for the type → blur → navigation → submit window
// and the debounce is never advanced, so any `q` in the POST
// /saved-views body can only have come from the immediate commit. React's
// async `act` yields via setImmediate, which stays real.

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
  /** Resolved with the saved view's filter when the POST /saved-views lands. */
  onSavedViewPost: (filter: Record<string, unknown>) => void;
}

function mountInboxHarness({ onSavedViewPost }: HarnessOptions) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    if (method === 'POST' && url === '/saved-views') {
      const input = body as { name: string; filter: Record<string, unknown> };
      onSavedViewPost(input.filter);
      return jsonResponse(200, savedView('view-new', input.name, input.filter));
    }
    if (method === 'GET' && url === '/saved-views?surface=voc') {
      return jsonResponse(200, { items: [] });
    }
    if (method === 'GET' && url.startsWith('/vocs?')) {
      return jsonResponse(200, { items: [] });
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

describe('#864 saving a view right after typing keeps q', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('commits q on blur so the POST /saved-views body has it before the debounce could elapse', async () => {
    let resolvePost!: (filter: Record<string, unknown>) => void;
    const postedFilter = new Promise<Record<string, unknown>>((resolve) => {
      resolvePost = resolve;
    });
    const { router } = mountInboxHarness({ onSavedViewPost: resolvePost });
    const box = await screen.findByRole('searchbox', { name: '필터, 키워드…' });
    const nameField = await screen.findByLabelText('저장된 보기 이름');

    // Mount and the first reads stay on real timers. Freeze only the
    // interaction window, and do not fake setImmediate: async act waits on it.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    try {
      // The user's flow starts by focusing the box; jsdom does not focus on
      // fireEvent.change, so focus explicitly — otherwise the later focus() on
      // the name field blurs nothing and no commit can happen.
      box.focus();
      fireEvent.change(box, { target: { value: '로그인' } });
      nameField.focus(); // blurs the search box — commit at once (#864)
      // The commit's navigate() settles in microtasks; flush so the URL (and
      // with it savedViewFilter) carries q before the save. The debounce
      // is frozen and is not advanced.
      await act(async () => {});
      fireEvent.change(nameField, { target: { value: '검색 보기' } });
      fireEvent.click(screen.getByTestId('saved-view-save'));

      const filter = await postedFilter;
      expect(filter.q).toBe('로그인');

      const search = router.state.location.search as Record<string, unknown>;
      expect(search.q).toBe('로그인');
    } finally {
      vi.useRealTimers();
    }
  });
});
