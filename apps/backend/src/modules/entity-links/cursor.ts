import { z } from 'zod';

import { HttpError } from '../../lib/errors.js';
import { normalizePgTimestampToIso } from '../../lib/pg-timestamp.js';

const entityLinksInventoryCursorSchema = z
  .object({
    createdAt: z.string().datetime({ offset: true }),
    id: z.string().uuid(),
  })
  .strict();

export type EntityLinksInventoryCursor = z.infer<typeof entityLinksInventoryCursorSchema>;

export function encodeEntityLinksInventoryCursor(input: {
  createdAtRaw: string;
  id: string;
}): string {
  return Buffer.from(
    JSON.stringify({ createdAt: normalizePgTimestampToIso(input.createdAtRaw), id: input.id }),
    'utf8',
  ).toString('base64');
}

export function decodeEntityLinksInventoryCursor(raw: string): EntityLinksInventoryCursor {
  const fail = () =>
    new HttpError('validation.failed', 'invalid cursor', {
      fields: [{ path: ['cursor'], code: 'invalid_cursor' }],
    });
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) throw fail();

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch {
    throw fail();
  }
  const result = entityLinksInventoryCursorSchema.safeParse(parsed);
  if (!result.success) throw fail();
  return result.data;
}
