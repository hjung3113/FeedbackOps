// Route-level check for #850: the inbox must treat a hand-typed /vocs?q=1000
// as the string '1000' — shown in the search box and sent as q=1000 on
// GET /vocs — instead of dropping it because the URL digits parse as a number.
//
// Strategy: render the real app router (`createAppRouter`) with the real route
// tree and a memory history entry, like RouteFallback.test.tsx does for
// production wiring. Only the network is stubbed.

import { listVocsQuerySchema } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ME_QUERY_KEY } from '@/lib/auth/useMe';
import { createAppRouter } from '@/lib/router/app-router';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const ME = {
  actor: {
    id: '11111111-1111-4111-8111-111111111111',
    external_id: 'inbox-user',
    email: 'inbox@example.test',
    display_name: 'Inbox User',
    role_level: 'user',
  },
  workspace_id: '22222222-2222-4222-8222-222222222222',
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('/vocs inbox numeric search (#850)', () => {
  it('puts ?q=1000 in the search box and sends q=1000 to GET /vocs', async () => {
    const vocsRequests: URL[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const rawUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost');
      if (url.pathname === '/vocs') {
        vocsRequests.push(url);
        return jsonResponse(200, { items: [], total: 0 });
      }
      if (url.pathname === '/nav/counts') return jsonResponse(200, { counts: {} });
      if (url.pathname === '/analytics-areas') return jsonResponse(200, { items: [] });
      if (url.pathname === '/managed-systems') {
        return jsonResponse(200, { items: [], page: { has_more: false } });
      }
      if (url.pathname === '/me/permissions/scope') {
        return jsonResponse(200, { scope: { kind: 'all' } });
      }
      if (url.pathname === '/me/permissions/check') {
        return jsonResponse(200, { state: 'approved', decision: { allow: true } });
      }
      if (url.pathname === '/me/saved-views') return jsonResponse(200, { items: [] });
      return jsonResponse(200, {});
    });
    vi.stubGlobal('fetch', fetchMock as typeof globalThis.fetch);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(ME_QUERY_KEY, ME);
    const router = createAppRouter(
      queryClient,
      createMemoryHistory({ initialEntries: ['/vocs?q=1000'] }),
    );

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('searchbox', { name: '필터, 키워드…' })).toHaveValue('1000');

    await waitFor(() => expect(vocsRequests.length).toBeGreaterThan(0));
    const requestUrl = vocsRequests[0];
    if (requestUrl === undefined) throw new Error('GET /vocs was never requested');
    expect(requestUrl.search).toContain('q=1000');
    expect(requestUrl.search).not.toContain('%221000%22');
    const parsed = listVocsQuerySchema.safeParse(Object.fromEntries(requestUrl.searchParams));
    expect(parsed.success && parsed.data.q).toBe('1000');
  });
});
