import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  permissionDecisionSchema,
  permissionDecisionsEnvelopeSchema,
  type PermissionDecisionsEnvelope,
} from '../index.js';

describe('PermissionDecision', () => {
  it('accepts a request_access decision with category', () => {
    const parsed = permissionDecisionSchema.parse({
      decision_id: '01919b8c-0000-7000-8000-000000000001',
      state: 'request_access',
      category: 'Linked Finding · scope outside Managed System',
      evaluated_at: '2026-05-17T10:00:00.000Z',
      reason: 'developer_outside_managed_system_scope',
    });
    expect(parsed.state).toBe('request_access');
    expect(parsed.category).toBe('Linked Finding · scope outside Managed System');
  });

  it('accepts a summary_visible decision with category and summary jsonb', () => {
    const parsed = permissionDecisionSchema.parse({
      decision_id: '01919b8c-0000-7000-8000-000000000002',
      state: 'summary_visible',
      category: 'Linked Finding · safe summary only',
      evaluated_at: '2026-05-17T10:00:00.000Z',
      reason: 'restricted_finding_same_managed_system',
      summary: { title: 'Redacted finding', body: 'Safe summary text.' },
    });
    expect(parsed.state).toBe('summary_visible');
    expect(parsed.summary).toBeDefined();
  });

  it('accepts a denied decision', () => {
    const parsed = permissionDecisionSchema.parse({
      decision_id: '01919b8c-0000-7000-8000-000000000006',
      state: 'denied',
      category: 'Linked Finding · access denied',
      evaluated_at: '2026-05-17T10:00:00.000Z',
    });
    expect(parsed.state).toBe('denied');
  });

  it('accepts a blocked_not_requestable decision', () => {
    const parsed = permissionDecisionSchema.parse({
      decision_id: '01919b8c-0000-7000-8000-000000000007',
      state: 'blocked_not_requestable',
      category: 'Linked Finding · structural restriction',
      evaluated_at: '2026-05-17T10:00:00.000Z',
    });
    expect(parsed.state).toBe('blocked_not_requestable');
  });

  it('rejects allow state (not a blocked-envelope state)', () => {
    expect(() =>
      permissionDecisionSchema.parse({
        decision_id: '01919b8c-0000-7000-8000-000000000008',
        state: 'allow',
        category: 'some category',
        evaluated_at: '2026-05-17T10:00:00.000Z',
      }),
    ).toThrow(z.ZodError);
  });

  it('rejects deny state (must be denied)', () => {
    expect(() =>
      permissionDecisionSchema.parse({
        decision_id: '01919b8c-0000-7000-8000-000000000009',
        state: 'deny',
        category: 'some category',
        evaluated_at: '2026-05-17T10:00:00.000Z',
      }),
    ).toThrow(z.ZodError);
  });

  it('rejects missing category', () => {
    expect(() =>
      permissionDecisionSchema.parse({
        decision_id: '01919b8c-0000-7000-8000-000000000010',
        state: 'denied',
        evaluated_at: '2026-05-17T10:00:00.000Z',
      }),
    ).toThrow(z.ZodError);
  });

  it('accepts omitting reason, required_scope, and summary', () => {
    const parsed = permissionDecisionSchema.parse({
      decision_id: '01919b8c-0000-7000-8000-000000000011',
      state: 'denied',
      category: 'Linked Finding · access denied',
      evaluated_at: '2026-05-17T10:00:00.000Z',
    });
    expect(parsed.reason).toBeUndefined();
    expect(parsed.required_scope).toBeUndefined();
    expect(parsed.summary).toBeUndefined();
  });

  it('rejects evaluated_at with a non-UTC offset (ADR-0015)', () => {
    expect(() =>
      permissionDecisionSchema.parse({
        decision_id: '01919b8c-0000-7000-8000-000000000005',
        state: 'denied',
        category: 'some category',
        evaluated_at: '2026-05-17T10:00:00.000+09:00',
      }),
    ).toThrow();
  });

  it('rejects an unknown decision state (bogus)', () => {
    expect(() =>
      permissionDecisionSchema.parse({
        decision_id: '01919b8c-0000-7000-8000-000000000003',
        state: 'bogus',
        category: 'some category',
        evaluated_at: '2026-05-17T10:00:00.000Z',
      }),
    ).toThrow(z.ZodError);
  });

  it('envelope keys are arbitrary strings (DecisionKey)', () => {
    const env: PermissionDecisionsEnvelope = {
      linkedFinding: {
        decision_id: '01919b8c-0000-7000-8000-000000000004',
        state: 'request_access',
        category: 'Linked Finding · scope outside Managed System',
        evaluated_at: '2026-05-17T10:00:00.000Z',
        required_scope: ['tableau'],
      },
    };
    expect(permissionDecisionsEnvelopeSchema.parse(env).linkedFinding?.state).toBe('request_access');
  });
});
