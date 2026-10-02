import { isPermissionDenied } from '@/lib/api';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../types';

describe('isPermissionDenied', () => {
  it.each(['permission.denied', 'permission.scope_required'] as const)(
    'returns true for a 403 %s ApiError',
    (code) => {
      expect(isPermissionDenied(new ApiError(403, { code, message: 'denied' }))).toBe(true);
    },
  );

  it.each([
    { label: 'a 403 with another code', status: 403, code: 'validation.failed' },
    { label: 'a 404 with a permission code', status: 404, code: 'permission.denied' },
  ] as const)('returns false for $label', ({ status, code }) => {
    expect(isPermissionDenied(new ApiError(status, { code, message: 'denied' }))).toBe(false);
  });

  it('returns false for a non-ApiError with matching status and code properties', () => {
    const error = Object.assign(new Error('denied'), {
      status: 403,
      code: 'permission.denied',
    });

    expect(isPermissionDenied(error)).toBe(false);
  });
});
