import { ApiError } from '@/lib/api';
import { describe, expect, it } from 'vitest';
import { classifyTriageMutationError } from '../triage-error-policy';

// Issue #908: the rate_limited.actor triage toast names the Retry-After wait
// the same way lib/api/errorMapper does.
describe('classifyTriageMutationError — rate_limited.actor', () => {
  it('names the Retry-After wait in the toast when the detail carries one', () => {
    const err = new ApiError(429, {
      code: 'rate_limited.actor',
      message: 'rate limit exceeded',
      detail: { retry_after_seconds: 30 },
    });
    const decision = classifyTriageMutationError(err);
    expect(decision.toast.message).toEqual('요청이 너무 많습니다. 30초 후 다시 시도해 주세요.');
  });

  it('keeps the generic 잠시 후 toast without a Retry-After detail', () => {
    const err = new ApiError(429, {
      code: 'rate_limited.actor',
      message: 'rate limit exceeded',
    });
    const decision = classifyTriageMutationError(err);
    expect(decision.toast.message).toEqual('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
  });
});
