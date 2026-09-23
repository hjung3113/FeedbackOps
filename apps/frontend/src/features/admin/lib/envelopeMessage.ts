import { ApiError } from '../../../lib/api';

export function envelopeMessage(err: unknown): string {
  if (err instanceof ApiError) return `${err.envelope.code}: ${err.envelope.message}`;
  if (err instanceof Error) return err.message;
  return 'unknown error';
}
