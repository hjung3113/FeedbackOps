import { mapUnknownError } from '../../../lib/api/errorMapper';

export function envelopeMessage(err: unknown): string {
  return mapUnknownError(err).message;
}
