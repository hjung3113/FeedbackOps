// Concurrent same-(actor, key) idempotency record race (M2, Slice 3 prologue Task 10).
//
// Pins the contract that `idempotencyService.record` collapses two concurrent
// same-key inserts to a single row via `INSERT ... ON CONFLICT DO NOTHING`.
// A future refactor that changes the conflict target or removes the
// `onConflictDoNothing` would surface as a 500 in production under retry
// pressure — this regression test catches that change.
//
// See `idempotency-service.ts:66-87` and ADR-0015:71-90.

import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../../db/client.js';
import * as coreSchema from '../../../../db/schema/core.js';
import * as permissionSchema from '../../../../db/schema/permission.js';
import { createIdempotencyService } from '../idempotency-service.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && WORKSPACE_ID);

const schema = { ...coreSchema, ...permissionSchema };

describe.skipIf(!runIntegration)('idempotencyService.record concurrent same-key (M2)', () => {
  let handle: DbHandle;

  beforeAll(async () => {
    handle = createDb(APP_URL);
  });

  afterAll(async () => {
    await handle.close();
  });

  it('onConflictDoNothing collapses two concurrent inserts to a single row, no error', async () => {
    const svc = createIdempotencyService();

    // Use the seeded admin actor so the FK to core.actors is satisfied:
    //   mock-admin-1 in workspace 11111111-...
    const actorRows = await handle.db.execute<{ id: string }>(sql`
      SELECT id FROM core.actors
      WHERE workspace_id = ${WORKSPACE_ID}
        AND external_id = 'mock-admin-1'
    `);
    const actorId = (actorRows as unknown as { rows: { id: string }[] }).rows[0]?.id;
    expect(actorId).toBeTruthy();
    if (!actorId) throw new Error('unreachable: actor id missing despite expect.toBeTruthy');

    const key = randomUUID();
    const hash = 'hash-m2-test';

    // Use TWO separate pool clients so the inserts truly contend on the
    // unique target without serialising on a single connection. drizzle
    // accepts a PoolClient (not only a Pool) — standard pattern for
    // shared-transaction tests.
    const connA = await handle.pool.connect();
    const connB = await handle.pool.connect();
    try {
      const dbA = drizzle(connA, { schema });
      const dbB = drizzle(connB, { schema });

      await connA.query('BEGIN');
      await connB.query('BEGIN');

      try {
        // INSERT ... ON CONFLICT DO NOTHING acquires a row lock on the
        // conflicting tuple and waits for the first writer's transaction
        // to end before deciding. Sequencing therefore is:
        //   1. A inserts (uncommitted) — returns immediately.
        //   2. B inserts — blocks on A's row lock.
        //   3. A commits — B unblocks, sees the committed row, no-ops.
        //   4. B commits — clean exit, no unique_violation.
        const aDone = svc.record(dbA, actorId, key, hash, 201, { winner: 'A' });
        await aDone;
        const bPending = svc.record(dbB, actorId, key, hash, 201, { winner: 'B' });
        await connA.query('COMMIT');
        await bPending;
        await connB.query('COMMIT');
      } catch (err) {
        await connA.query('ROLLBACK').catch(() => {});
        await connB.query('ROLLBACK').catch(() => {});
        throw err;
      }
    } finally {
      connA.release();
      connB.release();
    }

    try {
      const rows = await handle.db.execute<{ n: number }>(sql`
        SELECT count(*)::int AS n FROM core.idempotency_keys
        WHERE actor_id = ${actorId} AND key = ${key}
      `);
      expect((rows as unknown as { rows: { n: number }[] }).rows[0]?.n).toBe(1);
    } finally {
      // Cleanup the race row so other test runs are not polluted.
      await handle.db.execute(sql`
        DELETE FROM core.idempotency_keys WHERE actor_id = ${actorId} AND key = ${key}
      `);
    }
  });
});
