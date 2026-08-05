// useVocReporterReplyMutation.test.ts — TDD RED
// Tests:
//   1. success: body shape + If-Match + Idempotency-Key + calls onSuccess
//   2. error: conflict.idempotency_key_reuse (from error matrix)
//
// C5.3 of slice3 #21.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { reporterReplyRequestSchema } from '@fops/shared';
import {
  type ReporterReplyVars,
  useVocReporterReplyMutation,
} from '../useVocReporterReplyMutation';

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

const VOC_ID = '00000000-0000-0000-0000-000000000001';
const UPDATED_AT = '2026-05-01T00:00:00.000Z';

const REPLY_VARS: ReporterReplyVars = {
  vocId: VOC_ID,
  ifMatch: UPDATED_AT,
  body: {
    body_rich_content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'body' }] }],
    },
    attachment_ids: ['10000000-0000-4000-8000-000000000001'],
  },
};

// ── 1. Success: correct endpoint + headers + body + callback ──────────────

describe('useVocReporterReplyMutation', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('AC-A1d submitted reporter-reply body passes the canonical request schema', async () => {
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
      return jsonResponse({ id: VOC_ID, updated_at: '2026-05-02T00:00:00.000Z' });
    }) as typeof globalThis.fetch;

    const onSuccess = vi.fn();
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useVocReporterReplyMutation({ onSuccess }), {
      wrapper: Wrapper,
    });

    await act(async () => {
      result.current.mutate(REPLY_VARS);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // Correct endpoint
    expect(capturedUrl).toContain(`/vocs/${VOC_ID}/reporter-replies`);
    expect(capturedMethod.toUpperCase()).toBe('POST');

    // Idempotency-Key must be present (auto-minted by apiClient)
    const idkValue = capturedHeaders['idempotency-key'] ?? capturedHeaders['Idempotency-Key'];
    expect(idkValue).toBeTruthy();

    // If-Match must carry voc.updated_at
    const ifMatchValue = capturedHeaders['If-Match'] ?? capturedHeaders['if-match'];
    expect(ifMatchValue).toBe(UPDATED_AT);

    expect(capturedBody).toEqual(REPLY_VARS.body);
    expect(reporterReplyRequestSchema.safeParse(capturedBody).success).toBe(true);

    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  // ── 2. Error: idempotency key reuse ───────────────────────────────────────

  it('exposes conflict.idempotency_key_reuse error from mutation.error', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(
        {
          code: 'conflict.idempotency_key_reuse',
          message: 'Idempotency key already used',
          detail: { reason: 'Duplicate submission' },
        },
        409,
      ),
    ) as typeof globalThis.fetch;

    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useVocReporterReplyMutation(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      result.current.mutate(REPLY_VARS);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const err = result.current.error as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('conflict.idempotency_key_reuse');
    expect(err.status).toBe(409);
  });
});
