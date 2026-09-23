import { HttpError } from './errors.js';

/** ADR-0015 client idempotency key: UUIDv4. */
export const IDEMPOTENCY_KEY_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

/** Any 8-4-4-4-12 hex UUID. Not version- or variant-constrained. */
export const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** attachments download :id only. Version nibble 1-5, variant 8/9/a/b. */
export const RFC4122_UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

const ISO_TIMESTAMP_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function requireIdempotencyKey(headers: Record<string, unknown>): string {
  const raw = headers['idempotency-key'];
  const headerKey = Array.isArray(raw) ? raw[0] : raw;
  if (typeof headerKey !== 'string' || headerKey.length === 0) {
    throw new HttpError('validation.failed', 'Idempotency-Key header required', {
      fields: [{ path: ['headers', 'idempotency-key'], code: 'required' }],
    });
  }
  if (!IDEMPOTENCY_KEY_REGEX.test(headerKey)) {
    throw new HttpError('validation.malformed_idempotency_key', 'Idempotency-Key must be a UUIDv4');
  }
  return headerKey;
}

/** voc. Non-empty string. Not a timestamp check. */
export function requireIfMatch(headers: Record<string, unknown>): string {
  const raw = headers['if-match'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || value.length === 0) {
    throw new HttpError('validation.failed', 'If-Match header required', {
      fields: [{ path: ['headers', 'if-match'], code: 'required' }],
    });
  }
  return value;
}

/** tasks only. Value must be an ISO timestamp with milliseconds. */
export function requireIfMatchTimestamp(headers: Record<string, unknown>): string {
  const raw = headers['if-match'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || !ISO_TIMESTAMP_REGEX.test(value)) {
    throw new HttpError('validation.failed', 'If-Match header required', {
      fields: [{ path: ['headers', 'if-match'], code: 'required' }],
    });
  }
  return value;
}
