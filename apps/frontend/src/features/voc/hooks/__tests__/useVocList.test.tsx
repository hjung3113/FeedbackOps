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

  test('does not retain an old-limit page after a limit change and failed pin', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.searchParams.get('limit') === '1') return jsonResponse({ items: [ITEM] });
      throw new Error('new page failed');
    });
    const { result, rerender } = renderHook(
      (params: Parameters<typeof useVocList>[0]) => useVocList(params),
      {
        wrapper: makeWrapper(),
        initialProps: { view: 'triage', limit: 1, pinVocId: 'voc-1' },
      },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ view: 'triage', limit: 2, pinVocId: 'voc-1' });
    rerender({ view: 'triage', limit: 2, pinVocId: 'voc-2' });
    await waitFor(
      () => {
        expect(result.current.isError).toBe(true);
        expect(result.current.fetchStatus).toBe('idle');
      },
      { timeout: 5000 },
    );
    expect(result.current.data).toBeUndefined();
  });

  test('exposes the failed query status alongside retained pin-only data', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.searchParams.get('pin_voc_id') === 'voc-1') {
        return jsonResponse({ items: [ITEM] });
      }
      throw new Error('pin failed');
    });
    const { result, rerender } = renderHook(
      (params: Parameters<typeof useVocList>[0]) => useVocList(params),
      { wrapper: makeWrapper(), initialProps: { view: 'triage', pinVocId: 'voc-1' } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const page = result.current.data;
    rerender({ view: 'triage', pinVocId: 'voc-2' });
    await waitFor(
      () => {
        expect(result.current.isError).toBe(true);
        expect(result.current.fetchStatus).toBe('idle');
      },
      { timeout: 5000 },
    );
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.data).toBe(page);
  });
});
