import {
  recoveryActionSchema,
  recoveryListQuerySchema,
  recoveryListSchema,
  recoveryPresentationPatchSchema,
  recoveryPresentationSchema,
} from '@fops/shared';
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
describe('56-H recovery wire contract', () => {
  it('keeps Home actionability explicit and separates personal totals', () => {
    expect(recoveryListQuerySchema.parse({})).toEqual({
      view: 'operational',
      presentation: 'visible',
      limit: 50,
    });
    expect(recoveryListQuerySchema.parse({ presentation: 'hidden' }).presentation).toBe('hidden');
    expect(recoveryListQuerySchema.parse({ view: 'actionable', limit: '100' }).view).toBe(
      'actionable',
    );
    for (const query of [
      { actor_id: action.target.source_id },
      { presentation: 'all' },
      { limit: '101' },
      { category: 'task-request' },
    ]) {
      expect(recoveryListQuerySchema.safeParse(query).success).toBe(false);
    }
    const list = {
      computed_at: '2026-10-13T00:00:00.000Z',
      items: [],
      total: 0,
      visible_total: 0,
      hidden_total: 0,
      page: { has_more: false },
    };
    expect(recoveryListSchema.safeParse(list).success).toBe(true);
    expect(
      recoveryListSchema.safeParse({ ...list, actor_id: action.target.source_id }).success,
    ).toBe(false);
  });
  it.each([
    { action: 'snooze', days: 1 },
    { action: 'snooze', days: 7 },
    { action: 'mute' },
    { action: 'restore' },
  ])('accepts only the own-presentation action %j', (body) => {
    expect(recoveryPresentationPatchSchema.safeParse(body).success).toBe(true);
    for (const extra of [
      { actor_id: action.target.source_id },
      { owner_actor_id: action.target.source_id },
      { resolution: 'resolved' },
      { occurrence: 4 },
    ])
      expect(recoveryPresentationPatchSchema.safeParse({ ...body, ...extra }).success).toBe(false);
  });
  it.each([
    { action: 'snooze' },
    { action: 'snooze', days: 2 },
    { action: 'mute', days: 1 },
    { action: 'restore', days: 7 },
    { action: 'resolve' },
  ])('rejects invalid or contradictory presentation %j', (body) => {
    expect(recoveryPresentationPatchSchema.safeParse(body).success).toBe(false);
  });
  it.each([
    { state: 'visible', snoozed_until: '2026-10-14T00:00:00.000Z' },
    { state: 'muted', snoozed_until: '2026-10-14T00:00:00.000Z' },
    { state: 'snoozed', snoozed_until: null },
  ])('rejects incoherent stored presentation output %j', (presentation) => {
    expect(recoveryPresentationSchema.safeParse(presentation).success).toBe(false);
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
