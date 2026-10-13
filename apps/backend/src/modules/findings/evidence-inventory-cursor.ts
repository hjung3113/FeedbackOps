import type { ListEvidenceInventoryQuery } from '@fops/shared';
import { z } from 'zod';
import { HttpError } from '../../lib/errors.js';
import { normalizePgTimestampToIso } from '../../lib/pg-timestamp.js';
import type { FindingsActor } from './service.js';

const cursorSchema = z
  .object({
    // Zod accepts offsets such as +99:99 that PostgreSQL cannot cast; keep real ones only.
    timestamp: z
      .string()
      .datetime({ offset: true })
      .refine(
        (value) =>
          /(Z|[+-](0\d|1[0-4]):[0-5]\d)$/.test(value) && Number.isFinite(Date.parse(value)),
      ),
    id: z.string().uuid(),
    workspace: z.string().uuid(),
    actor: z.string().uuid(),
    scope: z.string(),
    source: z.string(),
    q: z.string(),
  })
  .strict();
export type EvidenceInventoryCursor = z.infer<typeof cursorSchema>;
export function inventoryCursorContext(actor: FindingsActor, query: ListEvidenceInventoryQuery) {
  return {
    workspace: actor.workspace_id,
    actor: actor.actor_id,
    scope: query.managed_system_id?.toLowerCase() ?? 'all',
    source: query.source_type ?? 'all',
    q: (query.q ?? '').toLowerCase(),
  };
}
export function encodeEvidenceInventoryCursor(cursor: EvidenceInventoryCursor): string {
  return Buffer.from(
    JSON.stringify({ ...cursor, timestamp: normalizePgTimestampToIso(cursor.timestamp) }),
  ).toString('base64url');
}
export function decodeEvidenceInventoryCursor(
  raw: string,
  context: ReturnType<typeof inventoryCursorContext>,
): EvidenceInventoryCursor {
  const fail = () =>
    new HttpError('validation.failed', 'invalid cursor', {
      fields: [{ path: ['cursor'], code: 'invalid_cursor' }],
    });
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) throw fail();
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw fail();
  }
  const parsed = cursorSchema.safeParse(value);
  if (!parsed.success) throw fail();
  for (const key of ['workspace', 'actor', 'scope', 'source', 'q'] as const) {
    if (parsed.data[key] !== context[key]) throw fail();
  }
  return parsed.data;
}
