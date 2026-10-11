import { z } from 'zod';
import { HttpError } from '../../lib/errors.js';
import { normalizePgTimestampToIso } from '../../lib/pg-timestamp.js';

const cursorSchema = z
  .object({ timestamp: z.string().datetime({ offset: true }), id: z.string().uuid() })
  .strict();
export type ListCursor = z.infer<typeof cursorSchema>;
export function encodeListCursor(input: ListCursor): string {
  return Buffer.from(
    JSON.stringify({ ...input, timestamp: normalizePgTimestampToIso(input.timestamp) }),
    'utf8',
  ).toString('base64');
}
export function decodeListCursor(raw: string): ListCursor {
  const fail = () =>
    new HttpError('validation.failed', 'invalid cursor', {
      fields: [{ path: ['cursor'], code: 'invalid_cursor' }],
    });
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) throw fail();
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch {
    throw fail();
  }
  const parsed = cursorSchema.safeParse(value);
  if (!parsed.success) throw fail();
  return parsed.data;
}
