import { HttpError } from '../../lib/errors.js';

export function isAuthorizationAbsence(error: unknown): error is HttpError {
  return (
    error instanceof HttpError &&
    (error.code === 'permission.denied' || error.code === 'permission.scope_required')
  );
}
