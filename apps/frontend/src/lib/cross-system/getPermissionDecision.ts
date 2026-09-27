// Two permission_decisions shapes, two parsers.
//
// Linked-object keys (linkedFinding, …) use `permissionDecisionSchema`
// (`decision_id`, `category`, `evaluated_at`, `required_scope: string[]`).
// A schema failure returns null so a bad linked decision does not invent a block.
//
// Summary `_self` is a different contract (`vocSummarySelfDecisionSchema`):
// `request_access` + `requestable_permission`, or `blocked_not_requestable` +
// `reason`. It has never matched `permissionDecisionSchema`. Parse it only with
// `getSummarySelfDecision`, which fail-closes to `denied` when that schema fails.
// `requestable_permission` is not copied onto `required_scope` — the summary
// panel did not show a scope line before this adapter existed.

import {
  type PermissionDecision,
  type PermissionDecisionState,
  permissionDecisionSchema,
  vocSummarySelfDecisionSchema,
} from '@fops/shared';

const FAIL_CLOSED_REASON = '권한 결정 데이터를 해석할 수 없습니다.';

export interface PermissionDecisionView {
  state: PermissionDecisionState;
  reason?: string;
  required_scope?: string[];
  decision_id?: string;
  category?: string;
  evaluated_at?: string;
  summary?: PermissionDecision['summary'];
}

export function getPermissionDecision(
  entity: { permission_decisions?: Record<string, unknown> | null } | null | undefined,
  key: string,
): PermissionDecisionView | null {
  const raw = entity?.permission_decisions?.[key];
  if (raw === undefined || raw === null) return null;

  const parsed = permissionDecisionSchema.safeParse(raw);
  if (parsed.success) {
    const decision = parsed.data;
    return {
      state: decision.state,
      decision_id: decision.decision_id,
      category: decision.category,
      evaluated_at: decision.evaluated_at,
      ...(decision.reason !== undefined ? { reason: decision.reason } : {}),
      ...(decision.required_scope !== undefined ? { required_scope: decision.required_scope } : {}),
      ...(decision.summary !== undefined ? { summary: decision.summary } : {}),
    };
  }

  console.warn(`[getPermissionDecision] schema parse failed for key "${key}" — BE schema drift?`);
  return null;
}

export function getSummarySelfDecision(
  entity: { permission_decisions?: Record<string, unknown> | null } | null | undefined,
): PermissionDecisionView {
  const parsed = vocSummarySelfDecisionSchema.safeParse(entity?.permission_decisions?._self);
  if (!parsed.success) {
    console.warn('[getSummarySelfDecision] schema parse failed for _self — BE schema drift?');
    return { state: 'denied', reason: FAIL_CLOSED_REASON };
  }

  if (parsed.data.state === 'blocked_not_requestable') {
    return { state: 'blocked_not_requestable', reason: parsed.data.reason };
  }

  // request_access: do not surface requestable_permission.permission as a scope line.
  return { state: 'request_access' };
}
