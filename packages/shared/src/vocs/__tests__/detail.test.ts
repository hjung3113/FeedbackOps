import { describe, expect, it } from 'vitest';
import { vocDetailEnvelopeSchema, vocSummaryEnvelopeSchema } from '../detail.js';

const U = '01919b8c-0000-7000-8000-000000000001';
const U2 = '01919b8c-0000-7000-8000-000000000002';

const baseListItem = {
  id: U,
  display_id: 'VOC-001',
  title: 'Test VOC',
  primary_managed_system_id: U2,
  analytics_area_id: null,
  reporter_id: U,
  owner_user_id: null,
  owner_team_id: null,
  severity: null,
  reporter_facing_status: 'received' as const,
  triage_state: 'untriaged' as const,
  source_context: 'direct_use' as const,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  similar_count: 0,
  // PLAN-22 §Bug-1 (2026-05-22)
  attachment_count: 0,
};

const validDetail = {
  ...baseListItem,
  similar: { items: [] },
  description_rich_content: { type: 'doc', content: [] },
  next_actions: [],
  next_reporter_states: {
    allowed: ['reviewing'] as const,
    forbidden: { assigned: 'not ready' },
  },
  linked_execution: { findingRef: null, taskRef: null },
  conversation_timeline: [],
  conversation_page: { has_more: false },
  permission_decisions: {},
  // PLAN-22 §Bug-1 (2026-05-22): always present — defaults to [] when none.
  attachments: [],
};

describe('vocDetailEnvelopeSchema', () => {
  it('accepts a valid detail envelope', () => {
    expect(() => vocDetailEnvelopeSchema.parse(validDetail)).not.toThrow();
  });

  it('accepts a capped similar peer preview', () => {
    const result = vocDetailEnvelopeSchema.parse({
      ...validDetail,
      similar: {
        items: [{
          id: U2,
          display_id: 'VOC-002',
          title: 'Peer VOC',
          reporter_facing_status: 'received',
          severity: 'high',
        }],
      },
    });
    expect(result.similar.items[0]?.display_id).toBe('VOC-002');
  });

  it('rejects a similar peer preview with more than three items', () => {
    const peer = {
      id: U2,
      display_id: 'VOC-002',
      title: 'Peer VOC',
      reporter_facing_status: 'received' as const,
      severity: 'high' as const,
    };

    expect(() => vocDetailEnvelopeSchema.parse({
      ...validDetail,
      similar: {
        items: [
          peer,
          { ...peer, id: '01919b8c-0000-7000-8000-000000000003' },
          { ...peer, id: '01919b8c-0000-7000-8000-000000000004' },
          { ...peer, id: '01919b8c-0000-7000-8000-000000000005' },
        ],
      },
    })).toThrow();
  });

  it('accepts description_rich_content as any shape (opaque)', () => {
    const result = vocDetailEnvelopeSchema.parse({
      ...validDetail,
      description_rich_content: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
    expect(result.description_rich_content).toBeDefined();
  });

  it('accepts conversation entries in conversation_timeline', () => {
    const entry = {
      id: U,
      kind: 'public_update' as const,
      actor_id: U2,
      body_rich_content: { type: 'doc' },
      created_at: '2026-01-01T00:00:00.000Z',
      visibility: 'public' as const,
      attachments: [],
    };
    const result = vocDetailEnvelopeSchema.parse({
      ...validDetail,
      conversation_timeline: [entry],
    });
    expect(result.conversation_timeline).toHaveLength(1);
  });

  it('accepts conversation_page with cursor', () => {
    const result = vocDetailEnvelopeSchema.parse({
      ...validDetail,
      conversation_page: { cursor: 'abc123', has_more: true },
    });
    expect(result.conversation_page.has_more).toBe(true);
    expect(result.conversation_page.cursor).toBe('abc123');
  });

  it('accepts permission_decisions with nested data', () => {
    const result = vocDetailEnvelopeSchema.parse({
      ...validDetail,
      permission_decisions: { _self: { state: 'granted' } },
    });
    expect(result.permission_decisions).toHaveProperty('_self');
  });

  it('rejects linked_execution with non-null findingRef', () => {
    expect(() =>
      vocDetailEnvelopeSchema.parse({
        ...validDetail,
        linked_execution: { findingRef: 'some-ref', taskRef: null },
      }),
    ).toThrow();
  });

  it('rejects missing title (inherited from vocListItemSchema)', () => {
    const { title: _, ...rest } = validDetail;
    expect(() => vocDetailEnvelopeSchema.parse(rest)).toThrow();
  });
});

const validSummary = {
  id: U,
  display_id: 'VOC-001',
  primary_managed_system_id: U2,
  reporter_facing_status: 'received' as const,
  created_at: '2026-01-01T00:00:00.000Z',
  permission_decisions: {
    _self: { state: 'request_access', requestable: true },
  },
};

describe('vocSummaryEnvelopeSchema', () => {
  it('accepts a valid summary envelope', () => {
    expect(() => vocSummaryEnvelopeSchema.parse(validSummary)).not.toThrow();
  });

  it('accepts permission_decisions with blocked state', () => {
    const result = vocSummaryEnvelopeSchema.parse({
      ...validSummary,
      permission_decisions: { _self: { state: 'blocked_not_requestable' } },
    });
    expect(result.permission_decisions._self).toBeDefined();
  });

  it('rejects invalid reporter_facing_status', () => {
    expect(() =>
      vocSummaryEnvelopeSchema.parse({ ...validSummary, reporter_facing_status: 'pending' }),
    ).toThrow();
  });

  it('rejects invalid id (not uuid)', () => {
    expect(() =>
      vocSummaryEnvelopeSchema.parse({ ...validSummary, id: 'not-a-uuid' }),
    ).toThrow();
  });

  it('rejects missing display_id', () => {
    const { display_id: _, ...rest } = validSummary;
    expect(() => vocSummaryEnvelopeSchema.parse(rest)).toThrow();
  });
});
