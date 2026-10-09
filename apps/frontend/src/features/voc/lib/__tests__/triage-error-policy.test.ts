import { ApiError } from '@/lib/api';
import { describe, expect, it } from 'vitest';
import { classifyTriageMutationError } from '../triage-error-policy';

// Issue #908: the rate_limited.actor triage toast names the Retry-After wait
// the same way lib/api/errorMapper does.
describe('classifyTriageMutationError — rate_limited.actor', () => {
  it.each([
    [
      'with a Retry-After wait',
      { retry_after_seconds: 30 },
      '요청이 너무 많습니다. 30초 후 다시 시도해 주세요.',
    ],
    ['without a Retry-After wait', undefined, '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'],
  ])('builds the toast %s', (_label, detail, expected) => {
    const err = new ApiError(429, {
      code: 'rate_limited.actor',
      message: 'rate limit exceeded',
      ...(detail !== undefined ? { detail } : {}),
    });
    expect(classifyTriageMutationError(err).toast.message).toEqual(expected);
  });
});

it('maps postpone_review invalid_state to an actionable state message', () => {
  const err = new ApiError(422, {
    code: 'validation.failed',
    message: 'invalid state',
    detail: { fields: [{ path: ['postpone_review'], code: 'invalid_state' }] },
  });
  expect(classifyTriageMutationError(err).toast.message).toBe('미분류 VOC만 보류할 수 있습니다.');
});
