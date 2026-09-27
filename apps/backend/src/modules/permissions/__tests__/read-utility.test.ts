import { describe, expect, it } from 'vitest';

import { HttpError } from '../../../lib/errors.js';
import { isAuthorizationAbsence } from '../read-utility.js';

describe('isAuthorizationAbsence', () => {
  it.each(['permission.denied', 'permission.scope_required'] as const)(
    'recognizes %s as an authorization absence',
    (code) => {
      expect(isAuthorizationAbsence(new HttpError(code, 'hidden'))).toBe(true);
    },
  );

  it('does not classify other HTTP errors or ordinary errors as absence', () => {
    expect(isAuthorizationAbsence(new HttpError('not_found.record', 'missing'))).toBe(false);
    expect(isAuthorizationAbsence(new Error('failed'))).toBe(false);
  });
});
