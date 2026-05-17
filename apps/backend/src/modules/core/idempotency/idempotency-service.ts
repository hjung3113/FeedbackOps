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

import type { Tx } from '../../../db/tx.js';
import { idempotencyKeys } from '../../../db/schema/core.js';

export type { Tx };

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
    // F-005: two concurrent first-time requests with the same
    // (actor_id, key) both see "miss" at lookup, both run the handler, and
    // the second INSERT would hit a unique_violation that bubbles out as a
    // 500. ADR-0015:71-90 requires deterministic resolution: one writer
    // commits its row, the loser silently observes the committed row.
    //
    // We use INSERT ... ON CONFLICT DO NOTHING; the loser's transaction
    // proceeds with no row written here, which is acceptable because the
    // protocol replays a future client retry through `lookup()` and that
    // returns the winning row's body.
    await tx
      .insert(idempotencyKeys)
      .values({
        actorId,
        key,
        requestHash,
        responseStatus,
        responseBody: responseBody as object,
      })
      .onConflictDoNothing({
        target: [idempotencyKeys.actorId, idempotencyKeys.key],
      });
  }

  return { lookup, record };
}

export type IdempotencyService = ReturnType<typeof createIdempotencyService>;
