// Integration tests for the hourly rate_limits purge handler (F-018).
//
// Mirrors core.idempotency_purge: a sibling pg-boss job that bounds
// `core.rate_limits` row growth. ADR-0015:7-9 specifies the Postgres-backed
// rate-limit store; without a purge, anonymous-IP keys grow unbounded.
//
// Handler is exercised directly here — cron scheduling is covered in
// boot.integration.test.ts so we don't pay the scheduler tick latency.

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../../db/client.js';
import { purgeExpiredRateLimits } from '../rate-limits-purge.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL);

describe.skipIf(!runIntegration)('core.rate_limits_purge handler', () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;
  const testKeyPrefix = `purge-test-${randomUUID()}-`;

  beforeAll(() => {
    appHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
  });

  afterAll(async () => {
    await migrateHandle.pool
      .query(`delete from core.rate_limits where key like $1`, [`${testKeyPrefix}%`])
      .catch(() => {});
    await appHandle?.close();
    await migrateHandle?.close();
  });

  it('deletes rows whose expires_at is older than 1 hour', async () => {
    const key = `${testKeyPrefix}old`;
    await appHandle.pool.query(
      `insert into core.rate_limits (key, route_group, counter, expires_at)
       values ($1, 'global', 1, now() - interval '2 hours')`,
      [key],
    );

    const { deleted } = await purgeExpiredRateLimits({ db: appHandle.db });
    expect(deleted).toBeGreaterThanOrEqual(1);

    const after = await appHandle.pool.query(
      'select 1 from core.rate_limits where key = $1',
      [key],
    );
    expect(after.rowCount).toBe(0);
  });

  it('keeps rows whose expires_at is within the 1-hour grace window', async () => {
    const key = `${testKeyPrefix}young`;
    // expires_at 30 minutes ago: window elapsed but still inside grace.
    await appHandle.pool.query(
      `insert into core.rate_limits (key, route_group, counter, expires_at)
       values ($1, 'global', 1, now() - interval '30 minutes')`,
      [key],
    );

    await purgeExpiredRateLimits({ db: appHandle.db });

    const after = await appHandle.pool.query(
      'select 1 from core.rate_limits where key = $1',
      [key],
    );
    expect(after.rowCount).toBe(1);

    await appHandle.pool.query('delete from core.rate_limits where key = $1', [key]);
  });

  it('keeps rows whose expires_at is still in the future', async () => {
    const key = `${testKeyPrefix}live`;
    await appHandle.pool.query(
      `insert into core.rate_limits (key, route_group, counter, expires_at)
       values ($1, 'global', 1, now() + interval '1 minute')`,
      [key],
    );

    await purgeExpiredRateLimits({ db: appHandle.db });

    const after = await appHandle.pool.query(
      'select 1 from core.rate_limits where key = $1',
      [key],
    );
    expect(after.rowCount).toBe(1);

    await appHandle.pool.query('delete from core.rate_limits where key = $1', [key]);
  });
});
