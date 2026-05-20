import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ReactNode } from 'react';

import { useVocConversation } from '../useVocConversation';

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

const ENTRY = {
  id: 'entry-1',
  kind: 'public_update',
  actor_id: 'actor-1',
  body_rich_content: null,
  created_at: '2026-05-01T00:00:00Z',
  visibility: 'public',
};

describe('useVocConversation', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('fetches first page of conversation', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      expect(url).toContain('/vocs/voc-1/conversation');
      return jsonResponse({ items: [ENTRY], next_cursor: undefined, has_more: false });
    }) as typeof globalThis.fetch;

    const { result } = renderHook(
      () => useVocConversation({ vocId: 'voc-1' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0]?.items).toHaveLength(1);
    expect(result.current.data?.pages[0]?.items[0]?.id).toBe('entry-1');
  });

  test('includes kind filter in URL when specified', async () => {
    let capturedUrl = '';
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      capturedUrl = typeof input === 'string' ? input : input.toString();
      return jsonResponse({ items: [], next_cursor: undefined, has_more: false });
    }) as typeof globalThis.fetch;

    const { result } = renderHook(
      () => useVocConversation({ vocId: 'voc-1', kind: 'internal_comment' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(capturedUrl).toContain('kind=internal_comment');
  });

  test('getNextPageParam returns undefined when has_more=false (no more pages)', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ items: [ENTRY], next_cursor: 'cursor-abc', has_more: false }),
    ) as typeof globalThis.fetch;

    const { result } = renderHook(
      () => useVocConversation({ vocId: 'voc-1' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // hasNextPage should be false when has_more=false
    expect(result.current.hasNextPage).toBe(false);
  });

  test('hasNextPage is true when has_more=true', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ items: [ENTRY], next_cursor: 'cursor-abc', has_more: true }),
    ) as typeof globalThis.fetch;

    const { result } = renderHook(
      () => useVocConversation({ vocId: 'voc-1' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);
  });
});
