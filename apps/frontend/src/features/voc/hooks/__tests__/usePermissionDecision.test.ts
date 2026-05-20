import { describe, expect, test, vi, afterEach } from 'vitest';
import { usePermissionDecision } from '../usePermissionDecision';

// Pure derivation hook — no React/QueryClient needed.
// Call directly as a plain function for unit tests.

describe('usePermissionDecision', () => {
  afterEach(() => vi.restoreAllMocks());

  test('returns typed decision for valid key', () => {
    const entity = {
      permission_decisions: {
        _self: {
          state: 'request_access',
          reason: 'no_grant',
          decision_id: 'dec-1',
          evaluated_at: '2026-05-21T00:00:00Z',
          required_scope: { capability: 'voc.read', managed_system_id: 'ms-1' },
        },
      },
    };
    const result = usePermissionDecision(entity, '_self');
    expect(result).not.toBeNull();
    expect(result?.state).toBe('request_access');
    expect(result?.reason).toBe('no_grant');
    expect(result?.decisionId).toBe('dec-1');
    expect(result?.evaluatedAt).toBe('2026-05-21T00:00:00Z');
    expect(result?.requiredScope).toEqual({
      capability: 'voc.read',
      managed_system_id: 'ms-1',
    });
  });

  test('returns decision with summary when state is summary_visible', () => {
    const entity = {
      permission_decisions: {
        _self: {
          state: 'summary_visible',
          summary: { count: 3 },
        },
      },
    };
    const result = usePermissionDecision(entity, '_self');
    expect(result?.state).toBe('summary_visible');
    expect(result?.summary).toEqual({ count: 3 });
  });

  test('returns null when entity is null', () => {
    expect(usePermissionDecision(null, '_self')).toBeNull();
  });

  test('returns null when entity is undefined', () => {
    expect(usePermissionDecision(undefined, '_self')).toBeNull();
  });

  test('returns null when key is missing', () => {
    const entity = { permission_decisions: { other_key: { state: 'denied' } } };
    expect(usePermissionDecision(entity, '_self')).toBeNull();
  });

  test('defaults to denied for `_self` on unknown state (BE drift safety, REV-1 M2)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const entity = {
      permission_decisions: {
        _self: { state: 'unknown_future_state' },
      },
    };
    const result = usePermissionDecision(entity, '_self');
    expect(result).not.toBeNull();
    expect(result?.state).toBe('denied');
    expect(result?.reason).toBe('권한 결정 데이터를 해석할 수 없습니다.');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[usePermissionDecision]'),
      'unknown_future_state',
      expect.stringContaining('BE schema drift'),
    );
  });

  test('returns null on unknown state for non-_self keys (no safety fallback)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const entity = {
      permission_decisions: {
        linkedFinding: { state: 'unknown_future_state' },
      },
    };
    const result = usePermissionDecision(entity, 'linkedFinding');
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  test('returns null when permission_decisions is absent', () => {
    const entity = {};
    expect(usePermissionDecision(entity as never, '_self')).toBeNull();
  });
});
