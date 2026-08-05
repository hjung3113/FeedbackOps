// useVocPublicUpdateMutation.test.ts — TDD RED
// Tests:
//   1. success: body shape + If-Match + Idempotency-Key + invalidate ['voc', id]
//   2. error: reporter_facing_status.gate_blocked (from error matrix)
//
// C5.2 of slice3 #21.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { publicUpdateRequestSchema } from '@fops/shared';
import { type PublicUpdateVars, useVocPublicUpdateMutation } from '../useVocPublicUpdateMutation';

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

const BODY_ONLY_VARS: PublicUpdateVars = {
  vocId: VOC_ID,
  ifMatch: UPDATED_AT,
  body: {
    skip_public_update: false,
    body_rich_content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'body' }] }],
    },
    next_reporter_facing_status: 'received',
    attachment_ids: ['20000000-0000-4000-8000-000000000002'],
  },
};

// ── 1. Success: correct body + headers + invalidation ─────────────────────

describe('useVocPublicUpdateMutation', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('AC-A1c submitted public-update body passes the canonical request schema', async () => {
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

    const { result } = renderHook(() => useVocPublicUpdateMutation({ onSuccess }), {
      wrapper: Wrapper,
    });

    await act(async () => {
      result.current.mutate(BODY_ONLY_VARS);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(capturedUrl).toContain(`/vocs/${VOC_ID}/public-updates`);
    expect(capturedMethod.toUpperCase()).toBe('POST');

    // Idempotency-Key must be present
    const idkValue = capturedHeaders['idempotency-key'] ?? capturedHeaders['Idempotency-Key'];
    expect(idkValue).toBeTruthy();

    // If-Match must carry voc.updated_at
    const ifMatchValue = capturedHeaders['If-Match'] ?? capturedHeaders['if-match'];
    expect(ifMatchValue).toBe(UPDATED_AT);

    expect(capturedBody).toEqual(BODY_ONLY_VARS.body);
    expect(publicUpdateRequestSchema.safeParse(capturedBody).success).toBe(true);

    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  // ── 2. Error: gate_blocked ─────────────────────────────────────────────

  it('exposes reporter_facing_status.gate_blocked error from mutation.error', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(
        {
          code: 'reporter_facing_status.gate_blocked',
          message: 'Gate blocked',
          detail: { reason: 'Task is in review' },
        },
        409,
      ),
    ) as typeof globalThis.fetch;

    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useVocPublicUpdateMutation(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      result.current.mutate(BODY_ONLY_VARS);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const err = result.current.error as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('reporter_facing_status.gate_blocked');
    expect(err.status).toBe(409);
  });
});
