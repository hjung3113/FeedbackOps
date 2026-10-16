import { describe, expect, it } from 'vitest';

import {
  resolvePublicUpdateReviewCandidateRequestSchema,
  resolvePublicUpdateReviewCandidateResponseSchema,
} from '../public-update-review-candidate.js';

const ID = '11111111-1111-4111-8111-111111111111';
const DOC = { type: 'doc' as const, content: [] };

describe('resolvePublicUpdateReviewCandidateRequestSchema', () => {
  it('requires an explicit reporter-facing status when applying', () => {
    expect(() =>
      resolvePublicUpdateReviewCandidateRequestSchema.parse({
        action: 'apply',
        candidate_id: ID,
        public_update: { skip_public_update: false, body_rich_content: DOC },
      }),
    ).toThrow();
  });

  it('requires a non-empty dismissal reason', () => {
    expect(() =>
      resolvePublicUpdateReviewCandidateRequestSchema.parse({
        action: 'dismiss',
        candidate_id: ID,
        dismissal_reason: '  ',
      }),
    ).toThrow();
  });

  it('discriminates apply and dismiss resolve responses', () => {
    expect(
      resolvePublicUpdateReviewCandidateResponseSchema.parse({
        candidate_id: ID,
        action: 'dismiss',
      }),
    ).toEqual({ candidate_id: ID, action: 'dismiss' });
    expect(() =>
      resolvePublicUpdateReviewCandidateResponseSchema.parse({
        candidate_id: ID,
        action: 'apply',
      }),
    ).toThrow();
  });

  // #1187: the nested voc is the detail for full readers and the summary otherwise.
  describe('apply response voc (detail-or-summary)', () => {
    const summaryVoc = {
      id: ID,
      display_id: 'VOC-001',
      primary_managed_system_id: ID,
      reporter_facing_status: 'resolved' as const,
      created_at: '2026-01-01T00:00:00.000Z',
      permission_decisions: {
        _self: { state: 'blocked_not_requestable', reason: 'explicit_deny' },
      },
    };
    const detailVoc = {
      ...summaryVoc,
      title: 'Detail title',
      reporter_id: ID,
      owner_user_id: null,
      owner_team_id: null,
      analytics_area_id: null,
      severity: null,
      triage_state: 'untriaged' as const,
      source_context: 'direct_use' as const,
      updated_at: '2026-01-01T00:00:00.000Z',
      similar_count: 0,
      attachment_count: 0,
      similar: { items: [] },
      description_rich_content: DOC,
      next_actions: [],
      next_reporter_states: { allowed: ['reviewing' as const], forbidden: {} },
      linked_execution: { findingRef: null, taskRef: null },
      conversation_timeline: [],
      conversation_page: { has_more: false },
      attachments: [],
    };
    const applied = {
      id: ID,
      voc_id: ID,
      body_rich_content: DOC,
      reporter_facing_status_before: 'progress' as const,
      reporter_facing_status_after: 'resolved' as const,
      skip_public_update: false,
      skip_reason: null,
      created_at: '2026-01-01T00:00:00.000Z',
    };
    const parse = (voc: unknown) =>
      resolvePublicUpdateReviewCandidateResponseSchema.parse({
        candidate_id: ID,
        action: 'apply',
        public_update: { public_update: applied, voc },
      });

    it.each([
      ['detail keeps every field', detailVoc],
      ['summary keeps exactly its keys', summaryVoc],
    ])('%s', (_name, voc) => {
      const parsed = parse(voc);
      if (parsed.action !== 'apply') throw new Error('expected apply');
      expect(parsed.public_update.voc).toEqual(voc);
    });

    it('rejects a payload that is neither shape', () => {
      expect(() => parse({ id: ID })).toThrow();
    });
  });
});
