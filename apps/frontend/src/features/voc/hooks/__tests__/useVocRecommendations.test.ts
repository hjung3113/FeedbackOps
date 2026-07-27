// useVocRecommendations / dismiss / confirm — #168 step 6 chunk 6b hook layer.
//
// Asserts the wire calls (URL + method) and the cache invalidation contract:
// a confirm creates or joins a Cluster, so it must invalidate cluster state
// too, not only the recommendation list.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import {
  isCrossManagedSystemError,
  useConfirmVocRecommendation,
} from '../useConfirmVocRecommendation';
import { useDismissVocRecommendation } from '../useDismissVocRecommendation';
import { useVocRecommendations, vocRecommendationsQueryKey } from '../useVocRecommendations';

const VOC_ID = '00000000-0000-0000-0000-0000000000aa';
const CANDIDATE_ID = '00000000-0000-0000-0000-0000000000b1';
const CLUSTER_ID = '00000000-0000-0000-0000-0000000000c1';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function makeHarness() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

describe('#168 recommendation hooks', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('useVocRecommendations GETs the per-VOC recommendation resource under a per-VOC key', async () => {
    let capturedUrl = '';
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      capturedUrl = typeof input === 'string' ? input : input.toString();
      return jsonResponse({ available: true, embedding_version: 1, items: [], total: 0 });
    }) as unknown as typeof globalThis.fetch;

    const { qc, wrapper } = makeHarness();
    const { result } = renderHook(() => useVocRecommendations(VOC_ID), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(capturedUrl).toBe(`/vocs/${VOC_ID}/recommendations`);
    expect(qc.getQueryData(vocRecommendationsQueryKey(VOC_ID))).toEqual({
      available: true,
      embedding_version: 1,
      items: [],
      total: 0,
    });
  });

  it('useVocRecommendations stays idle without a VOC id', () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({})) as unknown as typeof globalThis.fetch;
    const { wrapper } = makeHarness();
    renderHook(() => useVocRecommendations(null), { wrapper });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('dismiss POSTs to the candidate dismiss URL and drops that candidate from the cached list', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = typeof input === 'string' ? input : input.toString();
      capturedMethod = (init?.method ?? 'GET').toUpperCase();
      return new Response(null, { status: 204 });
    }) as unknown as typeof globalThis.fetch;

    const { qc, wrapper } = makeHarness();
    qc.setQueryData(vocRecommendationsQueryKey(VOC_ID), {
      available: true,
      embedding_version: 1,
      items: [
        {
          voc_id: CANDIDATE_ID,
          display_id: 'VOC-101',
          title: 'a',
          severity: null,
          reporter_facing_status: 'received',
          score: 0.9,
        },
      ],
      total: 1,
    });

    const { result } = renderHook(() => useDismissVocRecommendation(VOC_ID), { wrapper });
    result.current.mutate(CANDIDATE_ID);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(capturedMethod).toBe('POST');
    expect(capturedUrl).toBe(`/vocs/${VOC_ID}/recommendations/${CANDIDATE_ID}/dismiss`);
    const cached = qc.getQueryData<{ items: unknown[]; total: number }>(
      vocRecommendationsQueryKey(VOC_ID),
    );
    expect(cached?.items).toHaveLength(0);
    expect(cached?.total).toBe(0);
  });

  it('confirm POSTs to the confirm URL and invalidates cluster state as well as the recommendation list', async () => {
    let capturedUrl = '';
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      capturedUrl = typeof input === 'string' ? input : input.toString();
      return jsonResponse({ voc_cluster_id: CLUSTER_ID, cluster_created: false });
    }) as unknown as typeof globalThis.fetch;

    const { qc, wrapper } = makeHarness();
    const invalidated: unknown[] = [];
    const spy = vi.spyOn(qc, 'invalidateQueries').mockImplementation(async (filters) => {
      invalidated.push(filters?.queryKey);
    });

    const { result } = renderHook(() => useConfirmVocRecommendation(VOC_ID), { wrapper });
    result.current.mutate(CANDIDATE_ID);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(capturedUrl).toBe(`/vocs/${VOC_ID}/recommendations/${CANDIDATE_ID}/confirm`);
    expect(invalidated).toEqual([
      ['voc-recommendations', VOC_ID],
      ['voc-clusters'],
      ['voc-cluster', CLUSTER_ID],
      ['voc', VOC_ID],
    ]);
    spy.mockRestore();
  });

  it('confirm rejects with an ApiError carrying the 422 out_of_scope field', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(
        {
          code: 'validation.failed',
          message: 'out of scope',
          detail: { fields: [{ path: ['candidate_voc_id'], code: 'out_of_scope' }] },
        },
        422,
      ),
    ) as unknown as typeof globalThis.fetch;

    const { wrapper } = makeHarness();
    const { result } = renderHook(() => useConfirmVocRecommendation(VOC_ID), { wrapper });
    result.current.mutate(CANDIDATE_ID);

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    const err = result.current.error as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(isCrossManagedSystemError(err)).toBe(true);
  });

  it('isCrossManagedSystemError ignores unrelated 422s and 404s', () => {
    const other422 = new ApiError(422, {
      code: 'validation.failed',
      message: 'bad id',
      detail: { fields: [{ path: ['id'], code: 'invalid' }] },
    });
    const notFound = new ApiError(404, { code: 'not_found.record', message: 'gone' });
    expect(isCrossManagedSystemError(other422)).toBe(false);
    expect(isCrossManagedSystemError(notFound)).toBe(false);
  });
});
