import { type TaskRequestStatus, convertTaskRequestRequestSchema } from '@fops/shared';

export { isPermissionDenied } from '@/lib/api/types';

export const REVIEW_DECISION_STATUSES = ['pending_review', 'needs_more_evidence'] as const;
const TASK_TITLE_TRUNCATION_MARKER = '…';

// The module-level null check narrows the statement that follows it, but not the
// function bodies below — they could run after any later reassignment as far as
// TS is concerned. Re-binding to a `number` const carries the narrowing into them.
const canonicalTitleMaxLength = convertTaskRequestRequestSchema.shape.title.maxLength;

if (canonicalTitleMaxLength === null) {
  throw new Error('Task conversion title requires a canonical maximum length.');
}

export const TASK_TITLE_MAX_LENGTH: number = canonicalTitleMaxLength;

export function defaultConvertTitle(requestedOutcome: string): string {
  if (requestedOutcome.length <= TASK_TITLE_MAX_LENGTH) return requestedOutcome;
  return `${requestedOutcome.slice(
    0,
    TASK_TITLE_MAX_LENGTH - TASK_TITLE_TRUNCATION_MARKER.length,
  )}${TASK_TITLE_TRUNCATION_MARKER}`;
}

export function canApproveTaskRequest(status: TaskRequestStatus): boolean {
  return REVIEW_DECISION_STATUSES.some((allowed) => allowed === status);
}

export function canRejectTaskRequest(status: TaskRequestStatus): boolean {
  return REVIEW_DECISION_STATUSES.some((allowed) => allowed === status);
}

export function canRequestEvidenceForTaskRequest(status: TaskRequestStatus): boolean {
  return status === 'pending_review';
}

export function canConvertTaskRequest(status: TaskRequestStatus): boolean {
  return status === 'approved';
}

export function canLinkExistingTaskRequest(status: TaskRequestStatus): boolean {
  return status === 'approved';
}
