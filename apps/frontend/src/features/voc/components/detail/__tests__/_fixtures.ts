// Shared test fixtures for VocDetailPanel C8 tests.

import type { VocDetailEnvelope } from '@fops/shared';
import type { UseQueryResult, UseInfiniteQueryResult } from '@tanstack/react-query';
import type { MeResponse } from '@/lib/auth/useMe';
import type { VocDetailResult } from '@/features/voc/hooks/useVocDetail';
import type { ConversationPage } from '@/features/voc/hooks/useVocConversation';

// ── Stub actors ──────────────────────────────────────────────────────────────

export const REPORTER_ID = '00000000-0000-0000-0000-000000000001';
export const OTHER_ACTOR_ID = '00000000-0000-0000-0000-000000000002';

export const ME_RESPONSE: MeResponse = {
  actor: {
    id: REPORTER_ID,
    external_id: 'reporter-1',
    email: 'reporter@feedbackops.local',
    display_name: '김개발',
    role_level: 'Reporter',
  },
  workspace_id: 'ws-1111',
};

// ── Canonical detail envelope ────────────────────────────────────────────────

export const DETAIL_ENVELOPE: VocDetailEnvelope = {
  id: 'voc-uuid-1111',
  display_id: 'VOC-0001',
  title: '테스트 VOC 제목',
  primary_managed_system_id: 'ms-uuid-1111',
  analytics_area_id: null,
  reporter_id: REPORTER_ID,
  owner_user_id: null,
  owner_team_id: null,
  severity: 'high',
  reporter_facing_status: 'received',
  triage_state: 'untriaged',
  source_context: 'direct_use',
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
  similar_count: 0,
  description_rich_content: { type: 'doc', content: [] },
  next_actions: [],
  next_reporter_states: { allowed: ['reviewing'], forbidden: {} },
  linked_execution: { findingRef: null, taskRef: null },
  conversation_timeline: [],
  conversation_page: { has_more: false },
  permission_decisions: {},
  // PLAN-22 §Bug-1 (2026-05-22): linked-attachment fields added to VocDetailEnvelope
  // (and attachment_count to the list-item shape). Default to empty for fixtures that
  // don't exercise attachments rendering.
  attachments: [],
  attachment_count: 0,
};

// ── Query result helpers ─────────────────────────────────────────────────────

export function makeDetailQuery(
  overrides: Partial<UseQueryResult<VocDetailResult>> = {},
): UseQueryResult<VocDetailResult> {
  return {
    data: DETAIL_ENVELOPE,
    isLoading: false,
    isError: false,
    isPending: false,
    isSuccess: true,
    error: null,
    status: 'success',
    fetchStatus: 'idle',
    isFetching: false,
    isRefetching: false,
    isLoadingError: false,
    isRefetchError: false,
    isPlaceholderData: false,
    isStale: false,
    dataUpdatedAt: 0,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    errorUpdateCount: 0,
    refetch: async () => makeDetailQuery() as ReturnType<typeof import('@tanstack/react-query').useQuery>,
    ...overrides,
  } as unknown as UseQueryResult<VocDetailResult>;
}

export function makeMeQuery(
  overrides: Partial<UseQueryResult<MeResponse>> = {},
): UseQueryResult<MeResponse> {
  return {
    data: ME_RESPONSE,
    isLoading: false,
    isError: false,
    isPending: false,
    isSuccess: true,
    error: null,
    status: 'success',
    fetchStatus: 'idle',
    isFetching: false,
    isRefetching: false,
    isLoadingError: false,
    isRefetchError: false,
    isPlaceholderData: false,
    isStale: false,
    dataUpdatedAt: 0,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    errorUpdateCount: 0,
    refetch: async () => makeMeQuery() as ReturnType<typeof import('@tanstack/react-query').useQuery>,
    ...overrides,
  } as unknown as UseQueryResult<MeResponse>;
}

export function makeConversationQuery(
  overrides: Partial<UseInfiniteQueryResult<{ pages: ConversationPage[] }>> = {},
): UseInfiniteQueryResult<{ pages: ConversationPage[] }> {
  return {
    data: { pages: [], pageParams: [] },
    isLoading: false,
    isError: false,
    isPending: false,
    isSuccess: true,
    error: null,
    status: 'success',
    fetchStatus: 'idle',
    isFetching: false,
    isRefetching: false,
    isFetchingNextPage: false,
    isFetchingPreviousPage: false,
    hasNextPage: false,
    hasPreviousPage: false,
    isLoadingError: false,
    isRefetchError: false,
    isPlaceholderData: false,
    isStale: false,
    dataUpdatedAt: 0,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    errorUpdateCount: 0,
    fetchNextPage: async () => makeConversationQuery() as ReturnType<typeof import('@tanstack/react-query').useInfiniteQuery>,
    fetchPreviousPage: async () => makeConversationQuery() as ReturnType<typeof import('@tanstack/react-query').useInfiniteQuery>,
    refetch: async () => makeConversationQuery() as ReturnType<typeof import('@tanstack/react-query').useQuery>,
    ...overrides,
  } as unknown as UseInfiniteQueryResult<{ pages: ConversationPage[] }>;
}
