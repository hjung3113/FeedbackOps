import { afterEach, describe, expect, test, vi } from 'vitest';

import { getPermissionDecision, getSummarySelfDecision } from '../getPermissionDecision';

const DECISION_ID = '01919b8c-0000-7000-8000-000000000001';
const EVALUATED_AT = '2026-05-17T10:00:00.000Z';

describe('getPermissionDecision', () => {
  afterEach(() => vi.restoreAllMocks());

  test('returns the shared-schema decision, including required_scope as string[]', () => {
    const entity = {
      permission_decisions: {
        linkedFinding: {
          decision_id: DECISION_ID,
          state: 'request_access',
          category: 'Linked Finding · scope outside Managed System',
          evaluated_at: EVALUATED_AT,
          reason: 'developer_outside_managed_system_scope',
          required_scope: ['tableau'],
        },
      },
    };
    const result = getPermissionDecision(entity, 'linkedFinding');
    expect(result).toEqual({
      state: 'request_access',
      decision_id: DECISION_ID,
      category: 'Linked Finding · scope outside Managed System',
      evaluated_at: EVALUATED_AT,
      reason: 'developer_outside_managed_system_scope',
      required_scope: ['tableau'],
    });
  });

  test('keeps summary when the decision matches the schema', () => {
    const entity = {
      permission_decisions: {
        _self: {
          decision_id: DECISION_ID,
          state: 'summary_visible',
          category: 'VOC 상세',
          evaluated_at: EVALUATED_AT,
          summary: { count: 3 },
        },
      },
    };
    const result = getPermissionDecision(entity, '_self');
    expect(result?.state).toBe('summary_visible');
    expect(result?.summary).toEqual({ count: 3 });
  });

  test('returns null when entity or the key is absent', () => {
    expect(getPermissionDecision(null, '_self')).toBeNull();
    expect(getPermissionDecision(undefined, '_self')).toBeNull();
    expect(getPermissionDecision({}, '_self')).toBeNull();
    expect(
      getPermissionDecision({ permission_decisions: { other: { state: 'denied' } } }, '_self'),
    ).toBeNull();
  });

  test('maps a live summary request_access _self without a scope line', () => {
    const liveSummary = {
      permission_decisions: {
        _self: {
          state: 'request_access',
          requestable_permission: {
            permission: 'voc.read',
            managed_system_id: DECISION_ID,
            reason_required: false,
          },
        },
      },
    };
    expect(getSummarySelfDecision(liveSummary)).toEqual({ state: 'request_access' });
  });

  test('maps a live summary blocked_not_requestable _self with its reason', () => {
    const liveSummary = {
      permission_decisions: {
        _self: { state: 'blocked_not_requestable', reason: 'explicit_deny' },
      },
    };
    expect(getSummarySelfDecision(liveSummary)).toEqual({
      state: 'blocked_not_requestable',
      reason: 'explicit_deny',
    });
  });

  test('fail-closes a malformed summary _self to denied', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const malformed = {
      permission_decisions: {
        _self: { state: 'request_access', requestable: true },
      },
    };
    expect(getSummarySelfDecision(malformed)).toEqual({
      state: 'denied',
      reason: '권한 결정 데이터를 해석할 수 없습니다.',
    });
    expect(getSummarySelfDecision({ permission_decisions: {} })).toEqual({
      state: 'denied',
      reason: '권한 결정 데이터를 해석할 수 없습니다.',
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[getSummarySelfDecision]'));
  });

  test('returns null on schema failure for non-_self keys', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = getPermissionDecision(
      { permission_decisions: { linkedFinding: { state: 'unknown_future_state' } } },
      'linkedFinding',
    );
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });
});
