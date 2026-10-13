import { recoveryActionSchema, recoveryListQuerySchema, recoveryListSchema } from '@fops/shared';
import { describe, expect, it } from 'vitest';

const action = {
  id: 'triage',
  label: 'VOC 검토',
  availability: 'available',
  blocked_reason: null,
  requestable_permission: null,
  target: {
    source_type: 'voc',
    source_id: '11111111-1111-4111-8111-111111111111',
    route: '/vocs/11111111-1111-4111-8111-111111111111',
    endpoint: '/vocs/11111111-1111-4111-8111-111111111111',
    method: 'PATCH',
    intent: 'triage',
  },
  confirmation: {
    required: false,
    title: 'VOC 검토',
    body: '담당자를 확인해 주세요.',
    risk_level: 'low',
    reason_required: false,
    audit_event_intent: null,
  },
};
describe('56-G recovery wire contract', () => {
  it('keeps Home actionability explicit and rejects caller authority or H fields', () => {
    expect(recoveryListQuerySchema.parse({})).toEqual({ view: 'operational', limit: 50 });
    expect(recoveryListQuerySchema.parse({ view: 'actionable', limit: '100' }).view).toBe(
      'actionable',
    );
    for (const query of [
      { actor_id: action.target.source_id },
      { presentation: 'hidden' },
      { limit: '101' },
      { category: 'task-request' },
    ]) {
      expect(recoveryListQuerySchema.safeParse(query).success).toBe(false);
    }
    const list = {
      computed_at: '2026-10-13T00:00:00.000Z',
      items: [],
      total: 0,
      page: { has_more: false },
    };
    expect(recoveryListSchema.safeParse(list).success).toBe(true);
    expect(recoveryListSchema.safeParse({ ...list, hidden_total: 0 }).success).toBe(false);
  });
  it('rejects contradictory action availability and unsafe route intents', () => {
    expect(recoveryActionSchema.safeParse(action).success).toBe(true);
    expect(recoveryActionSchema.safeParse({ ...action, blocked_reason: 'no_grant' }).success).toBe(
      false,
    );
    expect(
      recoveryActionSchema.safeParse({ ...action, availability: 'blocked_requestable' }).success,
    ).toBe(false);
    expect(
      recoveryActionSchema.safeParse({
        ...action,
        target: { ...action.target, route: '//evil.example' },
      }).success,
    ).toBe(false);
  });
});
