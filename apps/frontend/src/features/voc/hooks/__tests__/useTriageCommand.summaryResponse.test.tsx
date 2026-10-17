import { useVocDetail } from '@/lib/cross-system/useVocDetail';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type VocSummaryEnvelope,
  vocDetailEnvelopeSchema,
  vocListItemSchema,
  vocSummaryEnvelopeSchema,
} from '@fops/shared';
import { COMPENSATE_FAILURE_TOAST } from '../../lib/triage-error-policy';
import type { TriageInput } from '../../lib/triage-types';
import { useTriageCommand } from '../useTriageCommand';

const toastMock = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn() }));

vi.mock('sonner', () => ({ toast: toastMock }));

const VOC_ID = '00000000-0000-4000-8000-000000000111';
const MANAGED_SYSTEM_ID = '00000000-0000-4000-8000-000000000222';
const UPDATED_AT = '2026-05-01T00:00:00.000Z';

const SUMMARY_VOC: VocSummaryEnvelope = vocSummaryEnvelopeSchema.parse({
  id: VOC_ID,
  display_id: 'VOC-0118',
  primary_managed_system_id: MANAGED_SYSTEM_ID,
  reporter_facing_status: 'received',
  created_at: UPDATED_AT,
  permission_decisions: {
    _self: {
      state: 'request_access',
      requestable_permission: {
        permission: 'voc.read',
        managed_system_id: MANAGED_SYSTEM_ID,
        reason_required: true,
      },
    },
  },
});

const VOC_LIST_ITEM = vocListItemSchema.parse({
  id: VOC_ID,
  display_id: 'VOC-0118',
  title: 'Triage summary response',
  primary_managed_system_id: MANAGED_SYSTEM_ID,
  analytics_area_id: null,
  reporter_id: '00000000-0000-4000-8000-000000000333',
  owner_user_id: null,
  owner_team_id: null,
  severity: null,
  reporter_facing_status: 'received',
  triage_state: 'untriaged',
  review_postponed_at: null,
  source_context: 'direct_use',
  created_at: UPDATED_AT,
  updated_at: UPDATED_AT,
  similar_count: 0,
  attachment_count: 0,
});

const FULL_VOC = vocDetailEnvelopeSchema.parse({
  ...VOC_LIST_ITEM,
  description_rich_content: { type: 'doc', content: [] },
  next_actions: [],
  next_reporter_states: { allowed: ['reviewing'], forbidden: {} },
  linked_execution: { findingRef: null, taskRef: null },
  conversation_timeline: [],
  conversation_page: { has_more: false },
  permission_decisions: {},
  attachments: [],
});

const INPUT: TriageInput = {
  kind: 'confirm',
  vocId: VOC_ID,
  ifMatch: UPDATED_AT,
  severity: 'high',
  ownerUserId: null,
  ownerTeamId: null,
  analyticsAreaId: null,
};

function SummaryCacheObserver() {
  useVocDetail(VOC_ID);
  return null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('useTriageCommand with a summary response (#1187)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('accepts a forward summary response and shows the undo error after refetch', async () => {
    let patchCount = 0;
    let resolveForwardResponse: (response: Response) => void = () => {
      throw new Error('Forward response was not awaited');
    };
    const forwardResponse = new Promise<Response>((resolve) => {
      resolveForwardResponse = resolve;
    });

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(`/vocs/${VOC_ID}`);
      if (init?.method === 'PATCH') {
        patchCount += 1;
        if (patchCount === 1) return forwardResponse;
        return jsonResponse(
          {
            code: 'conflict.stale_write',
            message: 'Stale write',
            detail: {},
          },
          409,
        );
      }
      if (init?.method === 'GET') return jsonResponse(SUMMARY_VOC);
      throw new Error(`Unexpected request method: ${String(init?.method)}`);
    }) as typeof globalThis.fetch;

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(['voc', VOC_ID], FULL_VOC);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <SummaryCacheObserver />
        {children}
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useTriageCommand({ voc: VOC_LIST_ITEM }), { wrapper });

    let callToken: ReturnType<typeof result.current.commit>;
    act(() => {
      callToken = result.current.commit(INPUT);
    });
    expect(result.current.isSubmitting).toBe(true);

    await act(async () => {
      resolveForwardResponse(jsonResponse(SUMMARY_VOC));
    });
    await waitFor(() => expect(result.current.isSubmitting).toBe(false));
    expect(toastMock.error).not.toHaveBeenCalled();

    await waitFor(() => expect(queryClient.getQueryData(['voc', VOC_ID])).toEqual(SUMMARY_VOC));
    const forwardCacheValue = queryClient.getQueryData(['voc', VOC_ID]);
    expect(vocSummaryEnvelopeSchema.parse(forwardCacheValue)).toEqual(SUMMARY_VOC);
    expect(forwardCacheValue).toEqual(SUMMARY_VOC);
    expect(forwardCacheValue).not.toHaveProperty('title');
    expect(vocDetailEnvelopeSchema.safeParse(forwardCacheValue).success).toBe(false);

    act(() => {
      result.current.undoLast(callToken);
    });

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith(COMPENSATE_FAILURE_TOAST);
    });

    const refetchedCacheValue = queryClient.getQueryData(['voc', VOC_ID]);
    expect(vocSummaryEnvelopeSchema.parse(refetchedCacheValue)).toEqual(SUMMARY_VOC);
    expect(refetchedCacheValue).toEqual(SUMMARY_VOC);
    expect(vocDetailEnvelopeSchema.safeParse(refetchedCacheValue).success).toBe(false);
  });

  it('keeps the fresh detail cache without refetching after a full PATCH response', async () => {
    let detailReads = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(`/vocs/${VOC_ID}`);
      if (init?.method === 'PATCH') {
        return jsonResponse({
          ...FULL_VOC,
          triage_state: 'triaged',
          updated_at: '2026-05-01T00:01:00.000Z',
        });
      }
      if (init?.method === 'GET') {
        detailReads += 1;
        return jsonResponse(SUMMARY_VOC);
      }
      throw new Error(`Unexpected request method: ${String(init?.method)}`);
    }) as typeof globalThis.fetch;

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(['voc', VOC_ID], FULL_VOC);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <SummaryCacheObserver />
        {children}
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useTriageCommand({ voc: VOC_LIST_ITEM }), { wrapper });

    await act(async () => {
      result.current.commit(INPUT);
    });
    await waitFor(() => expect(result.current.isSubmitting).toBe(false));

    expect(detailReads).toBe(0);
    expect(queryClient.getQueryState(['voc', VOC_ID])?.isInvalidated).toBe(false);
    expect(queryClient.getQueryData(['voc', VOC_ID])).toEqual(FULL_VOC);
  });
});
