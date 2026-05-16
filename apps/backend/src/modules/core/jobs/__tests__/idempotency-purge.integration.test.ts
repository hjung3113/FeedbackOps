// Integration tests for the hourly idempotency-keys purge handler
// (ADR-0009 + ADR-0015:88). The handler is exercised directly — pg-boss
// cron scheduling is covered separately in boot.integration.test.ts so we
// don't pay the 60s scheduler tick latency here.
//
// Requires a running Postgres with both fops_app and fops_migrate roles
// and the Slice 1 + #6 migrations applied (see role-grants integration
// test header for full setup).

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../../db/client.js';
import { purgeExpiredIdempotencyKeys } from '../idempotency-purge.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

describe.skipIf(!runIntegration)('core.idempotency_purge handler', () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;
  let actorId: string;

  beforeAll(async () => {
    appHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    // Use the seeded `system` actor so we don't need to insert a new actor.
    const res = await appHandle.pool.query<{ id: string }>(
      `select id from core.actors where external_id = 'system' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    actorId = res.rows[0]?.id ?? '';
    expect(actorId).toBeTruthy();
  });

  afterAll(async () => {
    // Clean up any test rows that survived.
    await migrateHandle.pool
      .query(
        `delete from core.idempotency_keys where actor_id = $1 and request_hash like 'purge-test-%'`,
        [actorId],
      )
      .catch(() => {});
    await appHandle?.close();
    await migrateHandle?.close();
  });

  it('deletes rows whose created_at is older than 24 hours', async () => {
    const oldKey = randomUUID();
    await appHandle.pool.query(
      `insert into core.idempotency_keys (actor_id, key, request_hash, response_status, response_body, created_at)
       values ($1, $2, $3, 200, '{}'::jsonb, now() - interval '25 hours')`,
      [actorId, oldKey, `purge-test-${oldKey}`],
    );

    const { deleted } = await purgeExpiredIdempotencyKeys({ db: appHandle.db });
    expect(deleted).toBeGreaterThanOrEqual(1);

    const after = await appHandle.pool.query(
      'select 1 from core.idempotency_keys where actor_id = $1 and key = $2',
      [actorId, oldKey],
    );
    expect(after.rowCount).toBe(0);
  });

  it('keeps rows whose created_at is within the 24-hour window', async () => {
    const youngKey = randomUUID();
    await appHandle.pool.query(
      `insert into core.idempotency_keys (actor_id, key, request_hash, response_status, response_body, created_at)
       values ($1, $2, $3, 200, '{}'::jsonb, now() - interval '23 hours')`,
      [actorId, youngKey, `purge-test-${youngKey}`],
    );

    await purgeExpiredIdempotencyKeys({ db: appHandle.db });

    const after = await appHandle.pool.query(
      'select 1 from core.idempotency_keys where actor_id = $1 and key = $2',
      [actorId, youngKey],
    );
    expect(after.rowCount).toBe(1);

    // Cleanup so the row doesn't outlive the test run.
    await appHandle.pool.query(
      'delete from core.idempotency_keys where actor_id = $1 and key = $2',
      [actorId, youngKey],
    );
  });
});
