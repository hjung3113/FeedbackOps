import { describe, expect, it } from 'vitest';
import { vocListItemSchema } from '../list-item.js';

const U = '01919b8c-0000-7000-8000-000000000001';
const U2 = '01919b8c-0000-7000-8000-000000000002';

const valid = {
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
  // PLAN-22 §Bug-1 (2026-05-22): attachment_count is now required on list rows.
  attachment_count: 0,
};

describe('vocListItemSchema', () => {
  it('accepts a valid list item', () => {
    expect(() => vocListItemSchema.parse(valid)).not.toThrow();
  });

  it('accepts analytics_area_id as a UUID', () => {
    const result = vocListItemSchema.parse({ ...valid, analytics_area_id: U2 });
    expect(result.analytics_area_id).toBe(U2);
  });

  it('accepts all severity values', () => {
    for (const severity of ['low', 'medium', 'high', 'critical'] as const) {
      expect(vocListItemSchema.parse({ ...valid, severity }).severity).toBe(severity);
    }
  });

  it('accepts all reporter_facing_status values', () => {
    for (const s of ['received', 'reviewing', 'assigned', 'progress', 'prep', 'resolved', 'reopened', 'closed'] as const) {
      expect(vocListItemSchema.parse({ ...valid, reporter_facing_status: s }).reporter_facing_status).toBe(s);
    }
  });

  it('accepts all triage_state values', () => {
    for (const s of ['untriaged', 'triaged', 'needs_more_information', 'dismissed_not_actionable'] as const) {
      expect(vocListItemSchema.parse({ ...valid, triage_state: s }).triage_state).toBe(s);
    }
  });

  it('accepts all source_context values', () => {
    for (const s of ['direct_use', 'proxy_report', 'operational_discovery', 'stakeholder_request'] as const) {
      expect(vocListItemSchema.parse({ ...valid, source_context: s }).source_context).toBe(s);
    }
  });

  it('rejects invalid id (not uuid)', () => {
    expect(() => vocListItemSchema.parse({ ...valid, id: 'not-a-uuid' })).toThrow();
  });

  it('rejects invalid severity', () => {
    expect(() => vocListItemSchema.parse({ ...valid, severity: 'extreme' })).toThrow();
  });

  it('rejects invalid reporter_facing_status', () => {
    expect(() => vocListItemSchema.parse({ ...valid, reporter_facing_status: 'pending' })).toThrow();
  });

  it('rejects invalid triage_state', () => {
    expect(() => vocListItemSchema.parse({ ...valid, triage_state: 'unknown' })).toThrow();
  });

  it('rejects invalid source_context', () => {
    expect(() => vocListItemSchema.parse({ ...valid, source_context: 'email' })).toThrow();
  });

  it('rejects non-integer similar_count', () => {
    expect(() => vocListItemSchema.parse({ ...valid, similar_count: 1.5 })).toThrow();
  });

  it('rejects negative similar_count', () => {
    expect(() => vocListItemSchema.parse({ ...valid, similar_count: -1 })).toThrow();
  });

  it('rejects negative attachment_count', () => {
    expect(() => vocListItemSchema.parse({ ...valid, attachment_count: -1 })).toThrow();
  });

  it('rejects missing attachment_count', () => {
    const { attachment_count: _, ...rest } = valid;
    expect(() => vocListItemSchema.parse(rest)).toThrow();
  });

  it('rejects missing required field (title)', () => {
    const { title: _, ...rest } = valid;
    expect(() => vocListItemSchema.parse(rest)).toThrow();
  });
});
