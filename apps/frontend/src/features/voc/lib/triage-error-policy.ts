// triage-error-policy.ts — pure classification of triage mutation and
// compensation errors (issue #481). No sonner import: the hook applies the
// returned decision. Copy strings are byte-identical to the former
// TriagePanel error matrix; triage errors are intentionally NOT routed
// through lib/api/errorMapper (its conflict.stale_write copy differs).

import { ApiError } from '@/lib/api';

export type TriageToast = { level: 'warning' | 'error'; message: string };

export interface TriageMutationDecision {
  restore: boolean;
  lockPanel: boolean;
  toast: TriageToast;
}

/**
 * classifyTriageMutationError — maps a forward-mutation error to the
 * restore/lock/toast decision (PLAN-21 §302-307 matrix).
 *
 * - archived codes do NOT restore: the row stays removed from the queue.
 * - idempotency_key_reuse does NOT restore but DOES lock the panel until the
 *   user switches VOC.
 */
export function classifyTriageMutationError(err: unknown): TriageMutationDecision {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'conflict.stale_write':
        return {
          restore: true,
          lockPanel: false,
          toast: {
            level: 'warning',
            message: '다른 사용자가 먼저 수정했습니다. 새로 불러왔습니다.',
          },
        };
      case 'conflict.record_archived':
      case 'conflict.parent_archived':
        // Permanent remove — no restore needed
        return {
          restore: false,
          lockPanel: false,
          toast: { level: 'error', message: '이 항목은 보관되어 변경할 수 없습니다.' },
        };
      case 'permission.denied':
      case 'permission.scope_required':
        return {
          restore: true,
          lockPanel: false,
          toast: { level: 'error', message: '권한이 없습니다.' },
        };
      case 'rate_limited.actor':
        return {
          restore: true,
          lockPanel: false,
          toast: { level: 'warning', message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
        };
      case 'conflict.idempotency_key_reuse':
        // Lock the panel — user must switch VOC to unlock
        return {
          restore: false,
          lockPanel: true,
          toast: { level: 'error', message: '이미 처리된 요청입니다.' },
        };
      default:
        return {
          restore: true,
          lockPanel: false,
          toast: {
            level: 'error',
            message: '일시적 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
          },
        };
    }
  }
  return {
    restore: true,
    lockPanel: false,
    toast: { level: 'error', message: '일시적 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' },
  };
}

/**
 * isRefetchFailure — true for errors tagged by runTriageCompensation when the
 * refetch itself failed. Both the compensation-side skip check and the
 * mutation-side toast routing use this one predicate.
 */
export function isRefetchFailure(err: unknown): boolean {
  return err !== null && typeof err === 'object' && '__refetchFailure' in err;
}

export const REFETCH_FAILURE_TOAST = 'VOC를 새로 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.';
export const COMPENSATE_FAILURE_TOAST =
  '실행 취소 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
