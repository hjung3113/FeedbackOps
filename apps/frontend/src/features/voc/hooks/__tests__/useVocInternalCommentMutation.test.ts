// useVocInternalCommentMutation.test.ts — TDD RED
// Tests:
//   1. success: POST body + If-Match + Idempotency-Key + onSuccess called
//
// C5.4 of slice3 #21.

import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';

import {
  useVocInternalCommentMutation,
  type InternalCommentVars,
} from '../useVocInternalCommentMutation';
import { ApiError } from '@/lib/api';

// ── helpers ────────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return {
    qc,
    Wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const VOC_ID = '00000000-0000-0000-0000-000000000099';
const UPDATED_AT = '2026-05-01T00:00:00.000Z';

const BASE_VARS: InternalCommentVars = {
  vocId: VOC_ID,
  ifMatch: UPDATED_AT,
  body: {
    body_rich_content: { type: 'doc', content: [{ type: 'paragraph' }] },
    mentions: ['actor-1', 'actor-2'],
  },
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe('useVocInternalCommentMutation', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('sends POST with Idempotency-Key, If-Match headers and calls onSuccess', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: unknown = null;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = typeof input === 'string' ? input : input.toString();
      capturedMethod = init?.method ?? 'GET';
      const rawHeaders = init?.headers;
      if (rawHeaders && typeof rawHeaders === 'object' && !(rawHeaders instanceof Headers)) {
        capturedHeaders = rawHeaders as Record<string, string>;
      } else if (rawHeaders instanceof Headers) {
        rawHeaders.forEach((v, k) => {
          capturedHeaders[k] = v;
        });
      }
      if (init?.body) {
        capturedBody = JSON.parse(init.body as string);
      }
      return jsonResponse({ id: 'comment-uuid-1', created_at: '2026-05-02T00:00:00.000Z' });
    }) as typeof globalThis.fetch;

    const onSuccess = vi.fn();
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useVocInternalCommentMutation({ onSuccess }), {
      wrapper: Wrapper,
    });

    await act(async () => {
      result.current.mutate(BASE_VARS);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(capturedUrl).toContain(`/vocs/${VOC_ID}/internal-comments`);
    expect(capturedMethod.toUpperCase()).toBe('POST');

    // Idempotency-Key must be present.
    const idkValue = capturedHeaders['idempotency-key'] ?? capturedHeaders['Idempotency-Key'];
    expect(idkValue).toBeTruthy();

    // If-Match must carry voc.updated_at.
    const ifMatchValue = capturedHeaders['If-Match'] ?? capturedHeaders['if-match'];
    expect(ifMatchValue).toBe(UPDATED_AT);

    // Body shape.
    expect(capturedBody).toMatchObject({
      mentions: ['actor-1', 'actor-2'],
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});
