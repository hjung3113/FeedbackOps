// useReporterStatusTransitions.test.ts — TDD RED
// C4.1: hook reads voc.next_reporter_states + voc.reporter_status_gate.

import { describe, expect, it } from 'vitest';
import { useReporterStatusTransitions } from '../useReporterStatusTransitions';
import type { VocDetailEnvelope } from '@fops/shared';
import { renderHook } from '@testing-library/react';

// ── base envelope matching the shape defined in packages/shared (reporter_status_gate is optional)

const BASE_VOC: VocDetailEnvelope = {
  id: 'voc-uuid-1111',
  display_id: 'VOC-0001',
  title: 'Test',
  primary_managed_system_id: 'ms-1',
  analytics_area_id: null,
  reporter_id: 'actor-1',
  owner_user_id: null,
  owner_team_id: null,
  severity: null,
  reporter_facing_status: 'received',
  triage_state: 'untriaged',
  source_context: 'direct_use',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  similar_count: 0,
  description_rich_content: { type: 'doc', content: [] },
  next_actions: [],
  next_reporter_states: {
    allowed: ['reviewing', 'assigned'],
    forbidden: { resolved: '결과 확인 전에 해결됨으로 바꿀 수 없습니다.' },
  },
  linked_execution: { findingRef: null, taskRef: null },
  conversation_timeline: [],
  conversation_page: { has_more: false },
  permission_decisions: {},
};

describe('useReporterStatusTransitions', () => {
  it('returns allowed, forbidden, and null gate when no gate field present', () => {
    const { result } = renderHook(() => useReporterStatusTransitions(BASE_VOC));
    expect(result.current.allowed).toEqual(['reviewing', 'assigned']);
    expect(result.current.forbidden).toEqual({
      resolved: '결과 확인 전에 해결됨으로 바꿀 수 없습니다.',
    });
    expect(result.current.gate).toBeNull();
  });

  it('returns gate when reporter_status_gate is present on voc', () => {
    const vocWithGate = {
      ...BASE_VOC,
      reporter_status_gate: {
        blocking_for: ['resolved'] as const,
        reason: '연결된 Task가 doing 상태입니다.',
      },
    };
    const { result } = renderHook(() =>
      useReporterStatusTransitions(vocWithGate as VocDetailEnvelope),
    );
    expect(result.current.gate).not.toBeNull();
    expect(result.current.gate?.blocking_for).toContain('resolved');
    expect(result.current.gate?.reason).toMatch('Task');
  });
});
