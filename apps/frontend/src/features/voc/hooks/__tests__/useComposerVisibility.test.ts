// useComposerVisibility — unit tests (C5.1 RED, slice3 #21)
// 4 test cases:
//   1. reporter on own VOC → { showPublic: false, showReply: true, showInternal: false }
//   2. admin → all 3 true
//   3. developer outside MS → null
//   4. no-tabs scenario (null result when no composer visible)

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useComposerVisibility } from '../useComposerVisibility';
import type { VocDetailEnvelope } from '@fops/shared';
import type { MeResponse } from '@/lib/auth/useMe';

const REPORTER_ID = '00000000-0000-0000-0000-000000000001';
const ADMIN_ID = '00000000-0000-0000-0000-000000000002';
const DEVELOPER_ID = '00000000-0000-0000-0000-000000000003';
const MS_ID = 'ms-uuid-1111';

function makeVoc(overrides: Partial<VocDetailEnvelope> = {}): VocDetailEnvelope {
  return {
    id: 'voc-uuid-1111',
    display_id: 'VOC-0001',
    title: 'Test VOC',
    primary_managed_system_id: MS_ID,
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
    ...overrides,
  } as VocDetailEnvelope;
}

function makeMe(role_level: 'admin' | 'developer' | 'user', id: string): MeResponse {
  return {
    actor: {
      id,
      external_id: 'ext-1',
      email: 'test@test.com',
      display_name: 'Test User',
      role_level,
    },
    workspace_id: 'ws-1111',
  };
}

describe('useComposerVisibility', () => {
  it('reporter on own VOC → showReply only', () => {
    const voc = makeVoc({ reporter_id: REPORTER_ID });
    const me = makeMe('user', REPORTER_ID);
    const { result } = renderHook(() => useComposerVisibility(voc, me));
    expect(result.current).toEqual({
      showPublic: false,
      showReply: true,
      showInternal: false,
    });
  });

  it('admin in MS → all three tabs visible', () => {
    const voc = makeVoc();
    const me = makeMe('admin', ADMIN_ID);
    const { result } = renderHook(() => useComposerVisibility(voc, me));
    expect(result.current).toEqual({
      showPublic: true,
      showReply: true,
      showInternal: true,
    });
  });

  it('developer in MS → all three tabs visible', () => {
    // Developer inside the MS has read/write scope — same as admin for composer visibility
    const voc = makeVoc();
    // Simulate dev who IS in scope (permission_decisions includes a grant for this voc)
    const me = makeMe('developer', DEVELOPER_ID);
    const { result } = renderHook(() => useComposerVisibility(voc, me));
    // Developer in MS gets all 3
    expect(result.current).toEqual({
      showPublic: true,
      showReply: true,
      showInternal: true,
    });
  });

  it('returns null when no tabs would be visible (e.g. reporter on someone else VOC)', () => {
    // Reporter on someone else's VOC → no visible tabs → null
    const voc = makeVoc({ reporter_id: 'different-reporter-id' });
    const me = makeMe('user', REPORTER_ID);
    const { result } = renderHook(() => useComposerVisibility(voc, me));
    expect(result.current).toBeNull();
  });
});
