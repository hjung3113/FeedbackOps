// apps/backend/src/modules/voc/idempotent-command.ts
//
// Shared idempotency frame for VOC application commands (#392). Owns the
// transaction boundary that VOC HTTP routes previously owned, and reproduces
// the manual frame exactly — statement order, error code/message, recorded
// status — per the zero-behavior-change constraint:
//
//   1. pg_advisory_xact_lock(hashtext(actor_id), hashtext(key))
//   2. lookup(actor_id, key, hash) — match → replay stored response
//                                   — mismatch → conflict.idempotency_key_reuse
//   3. work(tx)
//   4. record(tx, actor_id, key, hash, status, body)
//
// createVocCommand intentionally does NOT use this helper: the route ran
// `idempotencyService.runIdempotent` for POST /vocs, whose mismatch error
// carries detail fields (ADR-0015) — preserved as-is.

import { sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import type { IdempotencyService } from '../core/idempotency/idempotency-service.js';

export interface IdempotentCommandArgs<TBody> {
  db: Db;
  idempotencyService: Pick<IdempotencyService, 'lookup' | 'record'>;
  actorId: string;
  idempotencyKey: string;
  requestHash: string;
  /** HTTP status recorded with the response and returned on replay. */
  status: number;
  work: (tx: Tx) => Promise<TBody>;
}

export async function runIdempotentCommand<TBody>(
  args: IdempotentCommandArgs<TBody>,
): Promise<{ status: number; body: TBody }> {
  const { db, idempotencyService, actorId, idempotencyKey, requestHash, status, work } = args;

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${actorId}), hashtext(${idempotencyKey}))`,
    );
    const hit = await idempotencyService.lookup(tx, actorId, idempotencyKey, requestHash);
    if (hit.kind === 'match') {
      return { status: hit.status, body: hit.body as TBody };
    }
    if (hit.kind === 'mismatch') {
      throw new HttpError(
        'conflict.idempotency_key_reuse',
        'Idempotency-Key reused with different request body',
      );
    }
    const envelope = await work(tx);
    await idempotencyService.record(tx, actorId, idempotencyKey, requestHash, status, envelope);
    return { status, body: envelope };
  });
}
