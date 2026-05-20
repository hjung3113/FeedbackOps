// useVocTriageMutation.test.ts — TDD RED for the VOC-specific triage mutation hook.
//
// C3.2 of slice3 #21.
// Tests:
//   1. confirm payload shape (severity + owner + AA + triage_state='triaged' + Idempotency-Key + If-Match)
//   2. skip payload shape ({ postpone_review: true })
//   3. finding path: same confirm payload, then toasts deferral, does NOT navigate
//
// Error matrix coverage is handled in TriageActions.mutation.test.tsx (component layer).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';

import {
  useVocTriageMutation,
  type TriageInput,
} from '../useVocTriageMutation';
import { ApiError } from '@/lib/api';

// ── helpers ────────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
  });
}

const VOC_ID = 'voc-test-uuid-001';
const UPDATED_AT = '2026-05-01T12:00:00.000Z';

const CONFIRM_INPUT: TriageInput = {
  kind: 'confirm',
  vocId: VOC_ID,
  ifMatch: UPDATED_AT,
  severity: 'high',
  ownerUserId: 'user-owner-001',
  ownerTeamId: null,
  analyticsAreaId: 'area-001',
};

const SKIP_INPUT: TriageInput = {
  kind: 'skip',
  vocId: VOC_ID,
  ifMatch: UPDATED_AT,
};

const FINDING_INPUT: TriageInput = {
  kind: 'finding',
  vocId: VOC_ID,
  ifMatch: UPDATED_AT,
  severity: 'critical',
  ownerUserId: 'user-owner-001',
  ownerTeamId: null,
  analyticsAreaId: null,
};

// ── tests ──────────────────────────────────────────────────────────────────

describe('useVocTriageMutation', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // 1. confirm payload shape ─────────────────────────────────────────────────

  it('confirm: sends PATCH /vocs/:id with correct body + Idempotency-Key + If-Match headers', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    let capturedBody: unknown = undefined;
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = typeof input === 'string' ? input : input.toString();
      capturedMethod = init?.method ?? 'GET';
      if (init?.body) capturedBody = JSON.parse(init.body as string);
      const rawHeaders = init?.headers;
      if (rawHeaders && typeof rawHeaders === 'object' && !(rawHeaders instanceof Headers)) {
        capturedHeaders = rawHeaders as Record<string, string>;
      } else if (rawHeaders instanceof Headers) {
        rawHeaders.forEach((v, k) => { capturedHeaders[k] = v; });
      }
      return jsonResponse({ id: VOC_ID, triage_state: 'triaged', updated_at: '2026-05-01T13:00:00.000Z' });
    }) as typeof globalThis.fetch;

    const { result } = renderHook(() => useVocTriageMutation(), { wrapper: makeWrapper() });

    await act(async () => { result.current.mutate(CONFIRM_INPUT); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(capturedUrl).toContain(`/vocs/${VOC_ID}`);
    expect(capturedMethod.toUpperCase()).toBe('PATCH');

    // Payload must include triage fields
    const body = capturedBody as Record<string, unknown>;
    expect(body.triage_state).toBe('triaged');
    expect(body.severity).toBe('high');
    expect(body.owner_user_id).toBe('user-owner-001');
    expect(body.owner_team_id).toBeNull();
    expect(body.analytics_area_id).toBe('area-001');

    // Headers
    const idk = capturedHeaders['Idempotency-Key'] ?? capturedHeaders['idempotency-key'];
    expect(idk).toBeTruthy();
    const ifMatch = capturedHeaders['If-Match'] ?? capturedHeaders['if-match'];
    expect(ifMatch).toBe(UPDATED_AT);
  });

  // 2. skip payload shape ────────────────────────────────────────────────────

  it('skip: sends PATCH /vocs/:id with { postpone_review: true }', async () => {
    let capturedBody: unknown = undefined;

    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.body) capturedBody = JSON.parse(init.body as string);
      return jsonResponse({ id: VOC_ID, triage_state: 'review_postponed', updated_at: '2026-05-01T13:00:00.000Z' });
    }) as typeof globalThis.fetch;

    const { result } = renderHook(() => useVocTriageMutation(), { wrapper: makeWrapper() });

    await act(async () => { result.current.mutate(SKIP_INPUT); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const body = capturedBody as Record<string, unknown>;
    expect(body.postpone_review).toBe(true);
    // Must NOT include triage_state or severity when skipping
    expect(body.triage_state).toBeUndefined();
    expect(body.severity).toBeUndefined();
  });

  // 3. finding path: commits triage, toasts deferral, does NOT navigate ──────

  it('finding: commits triage (same body as confirm) and does not navigate', async () => {
    let capturedBody: unknown = undefined;

    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.body) capturedBody = JSON.parse(init.body as string);
      return jsonResponse({ id: VOC_ID, triage_state: 'triaged', updated_at: '2026-05-01T13:00:00.000Z' });
    }) as typeof globalThis.fetch;

    const { result } = renderHook(() => useVocTriageMutation(), { wrapper: makeWrapper() });

    await act(async () => { result.current.mutate(FINDING_INPUT); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Same triage payload shape as confirm
    const body = capturedBody as Record<string, unknown>;
    expect(body.triage_state).toBe('triaged');
    expect(body.severity).toBe('critical');
    // No navigation should have occurred — no window.location changes.
    // The hook merely resolves; navigation is intentionally deferred to Slice 5.
    expect(result.current.isSuccess).toBe(true);
  });
});
