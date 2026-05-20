import type { PermissionState } from '@fops/ui';

const PERMISSION_STATES: readonly PermissionState[] = [
  'request_access',
  'summary_visible',
  'denied',
  'blocked_not_requestable',
];

function isPermissionState(v: unknown): v is PermissionState {
  return typeof v === 'string' && (PERMISSION_STATES as readonly string[]).includes(v);
}

export interface PermissionDecision {
  state: PermissionState;
  reason?: string;
  requiredScope?: { capability: string; managed_system_id?: string };
  decisionId?: string;
  evaluatedAt?: string;
  summary?: Record<string, unknown>;
}

export function usePermissionDecision(
  entity: { permission_decisions?: Record<string, unknown> } | null | undefined,
  key: string,
): PermissionDecision | null {
  if (!entity?.permission_decisions) return null;
  const raw = entity.permission_decisions[key];
  if (!raw || typeof raw !== 'object') return null;

  const r = raw as Record<string, unknown>;

  if (!isPermissionState(r['state'])) {
    console.warn(
      `[usePermissionDecision] unexpected state value for key "${key}":`,
      r['state'],
      '— BE schema drift?',
    );
    // For the `_self` key (controls whether the orchestrator renders the
    // full envelope vs the permission-blocked panel), defaulting to `null`
    // would let the orchestrator fall through to the full envelope path and
    // potentially leak data that BE intended to hide. Default to denied so
    // the UI degrades safely on schema drift. (REV-1 cycle 1 M2 fix.)
    if (key === '_self') {
      return { state: 'denied', reason: '권한 결정 데이터를 해석할 수 없습니다.' };
    }
    return null;
  }

  const decision: PermissionDecision = { state: r['state'] };

  if (typeof r['reason'] === 'string') {
    decision.reason = r['reason'];
  }
  if (r['required_scope'] && typeof r['required_scope'] === 'object') {
    const rs = r['required_scope'] as Record<string, unknown>;
    if (typeof rs['capability'] === 'string') {
      const scope: { capability: string; managed_system_id?: string } = {
        capability: rs['capability'],
      };
      if (typeof rs['managed_system_id'] === 'string') {
        scope.managed_system_id = rs['managed_system_id'];
      }
      decision.requiredScope = scope;
    }
  }
  if (typeof r['decision_id'] === 'string') {
    decision.decisionId = r['decision_id'];
  }
  if (typeof r['evaluated_at'] === 'string') {
    decision.evaluatedAt = r['evaluated_at'];
  }
  if (
    r['summary'] !== undefined &&
    r['summary'] !== null &&
    typeof r['summary'] === 'object' &&
    !Array.isArray(r['summary'])
  ) {
    decision.summary = r['summary'] as Record<string, unknown>;
  }

  return decision;
}
