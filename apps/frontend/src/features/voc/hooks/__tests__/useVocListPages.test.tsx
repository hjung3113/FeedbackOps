import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { useVocListPages } from '../useVocListPages';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const ITEM = {
  id: 'voc-1',
  display_id: 'VOC-0001',
  title: 'Test VOC',
  primary_managed_system_id: 'ms-1',
  analytics_area_id: null,
  reporter_id: 'actor-1',
  owner_user_id: null,
  owner_team_id: null,
  severity: 'high',
  reporter_facing_status: 'received',
  triage_state: 'untriaged',
  source_context: 'direct_use',
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
  similar_count: 0,
};

const EMPTY_PAGE = { items: [], page: { has_more: false } };

describe('useVocListPages', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('fetches the first page of 50 and returns its items', async () => {
    let capturedUrl = '';
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      capturedUrl = String(input);
      return jsonResponse({ items: [ITEM], page: { has_more: false } });
    }) as typeof globalThis.fetch;

    const { result } = renderHook(() => useVocListPages({ view: 'inbox' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0]?.items[0]?.id).toBe('voc-1');
    const params = new URL(capturedUrl, 'http://localhost').searchParams;
    expect(params.get('view')).toBe('inbox');
    expect(params.get('limit')).toBe('50');
    expect(params.has('cursor')).toBe(false);
    expect(result.current.hasNextPage).toBe(false);
  });

  test('has a next page only when page.has_more carries a cursor, and sends it', async () => {
    const urls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return urls.length === 1
        ? jsonResponse({ items: [ITEM], page: { has_more: true, cursor: 'next-1' } })
        : jsonResponse(EMPTY_PAGE);
    }) as typeof globalThis.fetch;

    const { result } = renderHook(() => useVocListPages({ view: 'my' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    await result.current.fetchNextPage();
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(new URL(urls[1] ?? '', 'http://localhost').searchParams.get('cursor')).toBe('next-1');
  });

  test('includes optional filters in the query string', async () => {
    let capturedUrl = '';
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      capturedUrl = String(input);
      return jsonResponse(EMPTY_PAGE);
    }) as typeof globalThis.fetch;

    const { result } = renderHook(
      () =>
        useVocListPages({
          view: 'inbox',
          managedSystemId: 'ms-123',
          tab: 'untriaged',
          filters: { 'filter.severity': ['high', 'critical'] },
          sort: 'created_at:desc',
        }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(capturedUrl).toContain('managed_system_id=ms-123');
    expect(capturedUrl).toContain('tab=untriaged');
    expect(capturedUrl).toContain('filter.severity=high%2Ccritical');
    expect(capturedUrl).toContain('sort=created_at%3Adesc');
  });

  test('sends q (#821) in the query string and omits it when absent', async () => {
    const urls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return jsonResponse(EMPTY_PAGE);
    }) as typeof globalThis.fetch;

    const { result, rerender } = renderHook(
      (params: Parameters<typeof useVocListPages>[0]) => useVocListPages(params),
      { wrapper: makeWrapper(), initialProps: { view: 'inbox', q: '결제 지연' } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const lastUrl = urls.at(-1);
    expect(lastUrl).toBeDefined();
    if (lastUrl === undefined) return;
    expect(new URL(lastUrl, 'http://localhost').searchParams.get('q')).toBe('결제 지연');

    rerender({ view: 'inbox' });
    await waitFor(() => expect(urls.length).toBeGreaterThan(1));
    expect(urls.at(-1)).not.toContain('q=');
  });

  test('translates the unified filter.reporterStatus key to the backend param (#89)', async () => {
    let capturedUrl = '';
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      capturedUrl = String(input);
      return jsonResponse(EMPTY_PAGE);
    }) as typeof globalThis.fetch;

    const { result } = renderHook(
      () => useVocListPages({ view: 'inbox', filters: { 'filter.reporterStatus': ['reviewing'] } }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(capturedUrl).toContain('filter.reporter_facing_status=reviewing');
    expect(capturedUrl).not.toContain('filter.reporterStatus');
  });

  test('returns error state on network failure', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network error');
    }) as typeof globalThis.fetch;

    const { result } = renderHook(() => useVocListPages({ view: 'inbox' }), {
      wrapper: makeWrapper(),
    });
    // retry: 1 means up to 2 attempts; allow extra time.
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });
  });
});
