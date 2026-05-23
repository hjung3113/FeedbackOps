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
// Callers that need the full ADR-0015 frame should prefer `runIdempotent` so
// the advisory lock, lookup, handler execution, and record stay together:
//
//   tx.transaction(async (tx) => {
//     return idempotencyService.runIdempotent(tx, actor_id, key, hash, runHandler);
//   });

import { and, eq, sql } from 'drizzle-orm';

import type { Tx } from '../../../db/tx.js';
import { idempotencyKeys } from '../../../db/schema/core.js';
import { HttpError } from '../../../lib/errors.js';

export type { Tx };

export type IdempotencyLookupResult =
  | { kind: 'miss' }
  | { kind: 'match'; status: number; body: unknown }
  | { kind: 'mismatch' };

export interface IdempotentResult<TBody = unknown> {
  status: number;
  body: TBody;
}

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

  async function runIdempotent<TBody>(
    tx: Tx,
    actorId: string,
    key: string,
    requestHash: string,
    handler: () => Promise<IdempotentResult<TBody>>,
  ): Promise<IdempotentResult<TBody>> {
    // ADR-0015 race-surface amendment: serialise first-time retries with the
    // same (actor_id, key) before lookup so only one handler can produce
    // side effects; followers replay the stored response.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${actorId}), hashtext(${key}))`);

    const hit = await lookup(tx, actorId, key, requestHash);
    if (hit.kind === 'match') {
      return { status: hit.status, body: hit.body as TBody };
    }
    if (hit.kind === 'mismatch') {
      throw new HttpError(
        'conflict.idempotency_key_reuse',
        'Idempotency-Key reused with a different request body',
      );
    }

    const response = await handler();
    await record(tx, actorId, key, requestHash, response.status, response.body);
    return response;
  }

  return { lookup, record, runIdempotent };
}

export type IdempotencyService = ReturnType<typeof createIdempotencyService>;
