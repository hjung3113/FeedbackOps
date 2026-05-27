import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { useVocList } from '../useVocList';

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

describe('useVocList', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('fetches inbox list and returns items', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      expect(url).toContain('view=inbox');
      return jsonResponse({ items: [ITEM], next_cursor: undefined });
    }) as typeof globalThis.fetch;

    const { result } = renderHook(() => useVocList({ view: 'inbox' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items).toHaveLength(1);
    expect(result.current.data?.items[0]?.id).toBe('voc-1');
  });

  test('includes optional filters in query string', async () => {
    let capturedUrl = '';
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      capturedUrl = typeof input === 'string' ? input : input.toString();
      return jsonResponse({ items: [], next_cursor: undefined });
    }) as typeof globalThis.fetch;

    const { result } = renderHook(
      () =>
        useVocList({
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

  test('translates the unified filter.reporterStatus key to the backend param filter.reporter_facing_status (#89)', async () => {
    let capturedUrl = '';
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      capturedUrl = typeof input === 'string' ? input : input.toString();
      return jsonResponse({ items: [], next_cursor: undefined });
    }) as typeof globalThis.fetch;

    const { result } = renderHook(
      () =>
        useVocList({
          view: 'inbox',
          filters: { 'filter.reporterStatus': ['reviewing'] },
        }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Backend expects the long-form param.
    expect(capturedUrl).toContain('filter.reporter_facing_status=reviewing');
    // The UI/URL key must NOT be sent verbatim.
    expect(capturedUrl).not.toContain('filter.reporterStatus');
  });

  test('returns error state on network failure', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network error');
    }) as typeof globalThis.fetch;

    const { result } = renderHook(() => useVocList({ view: 'inbox' }), {
      wrapper: makeWrapper(),
    });
    // retry: 1 in the hook means up to 2 attempts; allow extra time.
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });
  });
});
