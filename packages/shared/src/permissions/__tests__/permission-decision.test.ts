import { describe, expect, it } from 'vitest';

import {
  permissionDecisionSchema,
  permissionDecisionsEnvelopeSchema,
  type PermissionDecisionsEnvelope,
} from '../index.js';

describe('PermissionDecision', () => {
  it('accepts a request_access decision with stable id and timestamp', () => {
    const parsed = permissionDecisionSchema.parse({
      decision_id: '01919b8c-0000-7000-8000-000000000001',
      state: 'request_access',
      evaluated_at: '2026-05-17T10:00:00.000Z',
      reason: 'developer_outside_managed_system_scope',
    });
    expect(parsed.state).toBe('request_access');
  });

  it('accepts a summary_visible decision', () => {
    const parsed = permissionDecisionSchema.parse({
      decision_id: '01919b8c-0000-7000-8000-000000000002',
      state: 'summary_visible',
      evaluated_at: '2026-05-17T10:00:00.000Z',
      reason: 'restricted_finding_same_managed_system',
    });
    expect(parsed.state).toBe('summary_visible');
  });

  it('rejects an unknown decision state', () => {
    expect(() =>
      permissionDecisionSchema.parse({
        decision_id: '01919b8c-0000-7000-8000-000000000003',
        state: 'bogus',
        evaluated_at: '2026-05-17T10:00:00.000Z',
        reason: 'x',
      }),
    ).toThrow();
  });

  it('envelope keys are arbitrary strings (DecisionKey)', () => {
    const env: PermissionDecisionsEnvelope = {
      linkedFinding: {
        decision_id: '01919b8c-0000-7000-8000-000000000004',
        state: 'allow',
        evaluated_at: '2026-05-17T10:00:00.000Z',
        reason: 'capability_granted',
      },
    };
    expect(permissionDecisionsEnvelopeSchema.parse(env).linkedFinding?.state).toBe('allow');
  });
});
