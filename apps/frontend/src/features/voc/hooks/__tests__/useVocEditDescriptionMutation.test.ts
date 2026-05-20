// useVocEditDescriptionMutation.test.ts — TDD RED
// Tests: PATCH /vocs/:id/description with Idempotency-Key + If-Match + full
// error matrix (triage_already_committed, stale_write, 422 validation.failed,
// 422 rich_content.*, 409 parent_archived / record_archived).
//
// C6.1 of slice3 #21. No UI — pure hook layer.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';

import {
  useVocEditDescriptionMutation,
  type EditDescriptionVars,
} from '../useVocEditDescriptionMutation';
import { ApiError } from '@/lib/api';

// ── helpers ────────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
  });
}

const VOC_ID = '00000000-0000-0000-0000-000000000001';
const UPDATED_AT = '2026-05-01T00:00:00.000Z';

const SUCCESS_VARS: EditDescriptionVars = {
  vocId: VOC_ID,
  ifMatch: UPDATED_AT,
  body: { title: 'Updated title', description_rich_content: null, attachments: [] },
};

// ── 1. Success: correct body + headers sent ────────────────────────────────

describe('useVocEditDescriptionMutation', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('sends PATCH with Idempotency-Key and If-Match headers on success', async () => {
    let capturedReq: Request | null = null;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedReq = new Request(input, init);
      return jsonResponse({
        id: VOC_ID,
        title: 'Updated title',
        updated_at: '2026-05-02T00:00:00.000Z',
      });
    }) as typeof globalThis.fetch;

    const { result } = renderHook(
      () => useVocEditDescriptionMutation(),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      result.current.mutate(SUCCESS_VARS);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(capturedReq).not.toBeNull();
    const req = capturedReq!;
    // Must hit PATCH /vocs/:id/description
    expect(req.url).toContain(`/vocs/${VOC_ID}/description`);
    expect(req.method).toBe('PATCH');
    // Idempotency-Key must be present (auto-minted by apiClient)
    expect(req.headers.get('idempotency-key')).toBeTruthy();
    // If-Match must carry the voc's updated_at
    expect(req.headers.get('if-match')).toBe(UPDATED_AT);
  });

  // ── 2. 409 triage_already_committed ──────────────────────────────────────

  it('exposes triage_already_committed error (409) from mutation.error', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ code: 'conflict.triage_already_committed', message: 'already triaged' }, 409),
    ) as typeof globalThis.fetch;

    const { result } = renderHook(
      () => useVocEditDescriptionMutation(),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      result.current.mutate(SUCCESS_VARS);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const err = result.current.error as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('conflict.triage_already_committed');
    expect(err.status).toBe(409);
  });

  // ── 3. 409 stale_write: baseline If-Match value exposed ──────────────────

  it('exposes stale_write error (409) so caller can refresh baseline', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ code: 'conflict.stale_write', message: 'stale' }, 409),
    ) as typeof globalThis.fetch;

    const { result } = renderHook(
      () => useVocEditDescriptionMutation(),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      result.current.mutate(SUCCESS_VARS);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const err = result.current.error as ApiError;
    expect(err.code).toBe('conflict.stale_write');
    expect(err.status).toBe(409);
    // Variables must be preserved on the mutation result so the caller can retry
    // with refreshed ifMatch without re-entering the form values.
    expect(result.current.variables?.vocId).toBe(VOC_ID);
  });

  // ── 4. 422 validation.failed → per-field errors in detail ────────────────

  it('exposes validation.failed (422) with per-field detail', async () => {
    const fieldErrors = [
      { path: 'title', code: 'too_short', message: '제목을 입력해 주세요.' },
    ];
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(
        { code: 'validation.failed', message: 'invalid', detail: { fields: fieldErrors } },
        422,
      ),
    ) as typeof globalThis.fetch;

    const { result } = renderHook(
      () => useVocEditDescriptionMutation(),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      result.current.mutate(SUCCESS_VARS);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const err = result.current.error as ApiError;
    expect(err.code).toBe('validation.failed');
    expect(err.status).toBe(422);
    // detail.fields must be forwarded so the modal can call form.setError
    const detail = err.detail as { fields: typeof fieldErrors };
    expect(detail.fields).toEqual(fieldErrors);
  });

  // ── 5. 422 rich_content.* → editor border should go red in UI ────────────

  it('exposes rich_content.disallowed_node (422) for editor border-red signal', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(
        { code: 'rich_content.disallowed_node', message: 'disallowed node' },
        422,
      ),
    ) as typeof globalThis.fetch;

    const { result } = renderHook(
      () => useVocEditDescriptionMutation(),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      result.current.mutate(SUCCESS_VARS);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const err = result.current.error as ApiError;
    expect(err.code).toBe('rich_content.disallowed_node');
    expect(err.status).toBe(422);
  });

  // ── 6. 409 parent_archived / record_archived → close modal signal ─────────

  it('exposes record_archived (409) so caller can close modal and toast', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ code: 'conflict.record_archived', message: 'archived' }, 409),
    ) as typeof globalThis.fetch;

    const { result } = renderHook(
      () => useVocEditDescriptionMutation(),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      result.current.mutate(SUCCESS_VARS);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const err = result.current.error as ApiError;
    expect(err.code).toBe('conflict.record_archived');
    expect(err.status).toBe(409);
  });
});
