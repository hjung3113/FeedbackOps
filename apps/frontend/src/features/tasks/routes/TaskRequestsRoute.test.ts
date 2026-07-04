import { describe, expect, it } from 'vitest';
import {
  canApproveTaskRequest,
  canRejectTaskRequest,
  canRequestEvidenceForTaskRequest,
} from './TaskRequestsRoute';

describe('TaskRequestsRoute decision gating', () => {
  it.each(['pending_review', 'needs_more_evidence'] as const)(
    'allows approve and reject from %s',
    (status) => {
      expect(canApproveTaskRequest(status)).toBe(true);
      expect(canRejectTaskRequest(status)).toBe(true);
    },
  );

  it.each(['approved', 'rejected', 'converted'] as const)(
    'disables approve and reject from terminal or post-review status %s',
    (status) => {
      expect(canApproveTaskRequest(status)).toBe(false);
      expect(canRejectTaskRequest(status)).toBe(false);
    },
  );

  it('only allows requesting evidence from pending review', () => {
    expect(canRequestEvidenceForTaskRequest('pending_review')).toBe(true);
    expect(canRequestEvidenceForTaskRequest('needs_more_evidence')).toBe(false);
    expect(canRequestEvidenceForTaskRequest('approved')).toBe(false);
    expect(canRequestEvidenceForTaskRequest('rejected')).toBe(false);
    expect(canRequestEvidenceForTaskRequest('converted')).toBe(false);
  });
});
