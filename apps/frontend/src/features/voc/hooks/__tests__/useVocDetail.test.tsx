import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ReactNode } from 'react';

import { useVocDetail } from '../useVocDetail';

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

const DETAIL_ENVELOPE = {
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
  description_rich_content: null,
  next_actions: [],
  next_reporter_states: { allowed: ['reviewing'], forbidden: {} },
  linked_execution: { findingRef: null, taskRef: null },
  conversation_timeline: [],
  conversation_page: { has_more: false },
  permission_decisions: {},
};

describe('useVocDetail', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('fetches detail envelope for a known id', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      expect(url).toContain('/vocs/voc-1');
      return jsonResponse(DETAIL_ENVELOPE);
    }) as typeof globalThis.fetch;

    const { result } = renderHook(() => useVocDetail('voc-1'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ id: 'voc-1', title: 'Test VOC' });
  });

  test('returns summary envelope (only id fields, no title)', async () => {
    const summaryEnvelope = {
      id: 'voc-2',
      display_id: 'VOC-0002',
      primary_managed_system_id: 'ms-1',
      reporter_facing_status: 'received',
      created_at: '2026-05-01T00:00:00Z',
      permission_decisions: { _self: { state: 'summary_visible' } },
    };
    globalThis.fetch = vi.fn(async () => jsonResponse(summaryEnvelope)) as typeof globalThis.fetch;

    const { result } = renderHook(() => useVocDetail('voc-2'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ id: 'voc-2' });
    // title not present in summary envelope
    expect((result.current.data as Record<string, unknown>)['title']).toBeUndefined();
  });

  test('does not fetch when id is null (enabled=false)', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as typeof globalThis.fetch;

    const { result } = renderHook(() => useVocDetail(null), {
      wrapper: makeWrapper(),
    });
    // Should stay in idle/pending without fetching
    expect(result.current.isFetching).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('returns error on 404', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ code: 'not_found', message: 'Not found' }, 404),
    ) as typeof globalThis.fetch;

    const { result } = renderHook(() => useVocDetail('voc-missing'), {
      wrapper: makeWrapper(),
    });
    // retry: 1 in the hook means up to 2 attempts; allow extra time.
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });
  });
});
