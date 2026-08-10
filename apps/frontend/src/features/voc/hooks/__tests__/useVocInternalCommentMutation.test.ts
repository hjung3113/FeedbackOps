// useVocInternalCommentMutation.test.ts — TDD RED
// Tests:
//   1. success: POST body + If-Match + Idempotency-Key + onSuccess called
//
// C5.4 of slice3 #21.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type VocDetailEnvelope, internalCommentRequestSchema } from '@fops/shared';
import { DETAIL_ENVELOPE } from '../../components/detail/__tests__/_fixtures';
import {
  type InternalCommentSuccess,
  type InternalCommentVars,
  useVocInternalCommentMutation,
} from '../useVocInternalCommentMutation';

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
const MENTION_IDS = [
  '30000000-0000-4000-8000-000000000003',
  '30000000-0000-4000-8000-000000000004',
];

const UPDATED_VOC: VocDetailEnvelope = {
  ...DETAIL_ENVELOPE,
  id: VOC_ID,
  primary_managed_system_id: '00000000-0000-0000-0000-000000000010',
  reporter_id: '00000000-0000-0000-0000-000000000011',
  reporter_facing_status: 'reviewing',
  updated_at: '2026-05-02T00:00:00.000Z',
};

const SUCCESS_ENVELOPE: InternalCommentSuccess = {
  internal_comment: {
    id: '00000000-0000-0000-0000-000000000014',
    voc_id: VOC_ID,
    actor_id: '00000000-0000-0000-0000-000000000011',
    body_rich_content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'body' }] }],
    },
    created_at: '2026-05-02T00:00:00.000Z',
  },
  voc: UPDATED_VOC,
};

const BASE_VARS: InternalCommentVars = {
  vocId: VOC_ID,
  ifMatch: UPDATED_AT,
  body: {
    body_rich_content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'body' }] }],
    },
    mentions: MENTION_IDS,
    attachment_ids: ['30000000-0000-4000-8000-000000000005'],
  },
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe('useVocInternalCommentMutation', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('AC-A1e submitted internal-comment body passes the canonical request schema', async () => {
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
      return jsonResponse(SUCCESS_ENVELOPE, 201);
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

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(capturedUrl).toContain(`/vocs/${VOC_ID}/internal-comments`);
    expect(capturedMethod.toUpperCase()).toBe('POST');

    // Idempotency-Key must be present.
    const idkValue = capturedHeaders['idempotency-key'] ?? capturedHeaders['Idempotency-Key'];
    expect(idkValue).toBeTruthy();

    // If-Match must carry voc.updated_at.
    const ifMatchValue = capturedHeaders['If-Match'] ?? capturedHeaders['if-match'];
    expect(ifMatchValue).toBe(UPDATED_AT);

    expect(capturedBody).toEqual(BASE_VARS.body);
    expect(internalCommentRequestSchema.safeParse(capturedBody).success).toBe(true);

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess.mock.calls[0]?.[0]).toEqual(SUCCESS_ENVELOPE);
  });
});
