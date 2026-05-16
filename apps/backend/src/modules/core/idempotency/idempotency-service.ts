// Idempotency lookup/reserve service. Owned by the Core module per
// docs/implementation/02-domain-module-boundaries.md.
//
// Protocol (ADR-0015:71-90):
//   1. Lookup (actor_id, key) in core.idempotency_keys.
//   2. Hit + matching request_hash → return stored response.
//   3. Hit + mismatched hash       → throw HitMismatchError (controller → 409).
//   4. Miss                         → caller executes the handler, then calls
//                                     `record` inside the SAME transaction.
//
// The service exposes two methods rather than one combined "lookupOrReserve"
// because the response body is only known AFTER the application service runs
// the mutation. The middleware sequence is therefore:
//
//   tx.transaction(async (tx) => {
//     const hit = await idempotencyService.lookup(tx, actor_id, key, hash);
//     if (hit.kind === 'match') return hit.response;
//     if (hit.kind === 'mismatch') throw new HttpError('conflict.idempotency_key_reuse', ...);
//     const response = await runHandler();
//     await idempotencyService.record(tx, actor_id, key, hash, status, body);
//     return response;
//   });

import { and, eq } from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import { idempotencyKeys } from '../../../db/schema/core.js';

// Drizzle transaction handle accepted by the service. Using the same type as
// Db avoids a generics ramp; node-postgres drizzle's `.transaction(cb)`
// hands the callback a value assignable to NodePgDatabase<typeof schema>.
export type Tx = Db;

export type IdempotencyLookupResult =
  | { kind: 'miss' }
  | { kind: 'match'; status: number; body: unknown }
  | { kind: 'mismatch' };

export function createIdempotencyService() {
  async function lookup(
    tx: Tx,
    actorId: string,
    key: string,
    requestHash: string,
  ): Promise<IdempotencyLookupResult> {
    const rows = await tx
      .select({
        requestHash: idempotencyKeys.requestHash,
        responseStatus: idempotencyKeys.responseStatus,
        responseBody: idempotencyKeys.responseBody,
      })
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.actorId, actorId), eq(idempotencyKeys.key, key)))
      .limit(1);
    const row = rows[0];
    if (!row) return { kind: 'miss' };
    if (row.requestHash !== requestHash) return { kind: 'mismatch' };
    return { kind: 'match', status: row.responseStatus, body: row.responseBody };
  }

  async function record(
    tx: Tx,
    actorId: string,
    key: string,
    requestHash: string,
    responseStatus: number,
    responseBody: unknown,
  ): Promise<void> {
    await tx.insert(idempotencyKeys).values({
      actorId,
      key,
      requestHash,
      responseStatus,
      responseBody: responseBody as object,
    });
  }

  return { lookup, record };
}

export type IdempotencyService = ReturnType<typeof createIdempotencyService>;
