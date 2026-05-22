// Integration tests for pg-boss boot wiring and shutdown ordering
// (ADR-0009:22-27). The first test verifies the hourly cron is actually
// registered in pgboss.schedule after registerCoreJobs runs — that's the
// "is this real?" check the spec calls out. The second test verifies
// shutdown ordering: pg-boss `stop()` must resolve before Fastify
// `app.close()` is invoked.
//
// We don't fire a real SIGTERM here; signal-handler timing is too brittle.
// Instead we replay the orchestration logic from src/index.ts inline and
// assert call order.

import { Readable } from 'node:stream';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../../config.js';
import { type DbHandle, createDb } from '../../../../db/client.js';
import { initBoss, shutdownBoss } from '../../../../lib/jobs.js';
import type { StorageBackend, StorageGetResult } from '../../../../lib/storage/index.js';
import { buildServer } from '../../../../server.js';
import {
  ATTACHMENTS_PURGE_CRON,
  ATTACHMENTS_PURGE_QUEUE,
  IDEMPOTENCY_PURGE_CRON,
  IDEMPOTENCY_PURGE_QUEUE,
  RATE_LIMITS_PURGE_CRON,
  RATE_LIMITS_PURGE_QUEUE,
  registerCoreJobs,
} from '../index.js';

const stubStorage: StorageBackend = {
  async put() {
    return { key: 'unused' };
  },
  async get(): Promise<StorageGetResult> {
    return { stream: Readable.from(['x']), mimeType: 'application/octet-stream', size: 1 };
  },
  async delete() {
    /* no-op */
  },
  async exists() {
    return false;
  },
};

const APP_URL = process.env.DATABASE_URL ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && WORKSPACE_ID);

describe.skipIf(!runIntegration)('pg-boss boot wiring', () => {
  let dbHandle: DbHandle;
  let boss: Awaited<ReturnType<typeof initBoss>>;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    boss = await initBoss({ connectionString: APP_URL });
    await registerCoreJobs(boss, {
      db: dbHandle.db,
      pool: dbHandle.pool,
      storage: stubStorage,
    });
  });

  afterAll(async () => {
    await shutdownBoss(boss).catch(() => {});
    await dbHandle?.close();
  });

  it('registers the hourly idempotency-purge cron in pgboss.schedule', async () => {
    const schedules = await boss.getSchedules(IDEMPOTENCY_PURGE_QUEUE);
    const ours = schedules.find((s: { name: string }) => s.name === IDEMPOTENCY_PURGE_QUEUE);
    expect(ours).toBeDefined();
    expect(ours?.cron).toBe(IDEMPOTENCY_PURGE_CRON);
  });

  it('records the queue in pgboss.queue with ADR-0009 retry config', async () => {
    const row = await dbHandle.pool.query<{
      retry_limit: number;
      retry_delay: number;
      retry_backoff: boolean;
    }>(
      `select retry_limit, retry_delay, retry_backoff
         from pgboss.queue
         where name = $1`,
      [IDEMPOTENCY_PURGE_QUEUE],
    );
    expect(row.rowCount).toBe(1);
    expect(row.rows[0]?.retry_limit).toBe(5);
    expect(row.rows[0]?.retry_delay).toBe(30);
    expect(row.rows[0]?.retry_backoff).toBe(true);
  });

  it('registers the hourly rate-limits-purge cron in pgboss.schedule', async () => {
    const schedules = await boss.getSchedules(RATE_LIMITS_PURGE_QUEUE);
    const ours = schedules.find((s: { name: string }) => s.name === RATE_LIMITS_PURGE_QUEUE);
    expect(ours).toBeDefined();
    expect(ours?.cron).toBe(RATE_LIMITS_PURGE_CRON);
  });

  it('registers the hourly attachments-purge cron in pgboss.schedule', async () => {
    const schedules = await boss.getSchedules(ATTACHMENTS_PURGE_QUEUE);
    const ours = schedules.find((s: { name: string }) => s.name === ATTACHMENTS_PURGE_QUEUE);
    expect(ours).toBeDefined();
    expect(ours?.cron).toBe(ATTACHMENTS_PURGE_CRON);
  });

  it('records the attachments-purge queue in pgboss.queue with ADR-0009 retry config', async () => {
    const row = await dbHandle.pool.query<{
      retry_limit: number;
      retry_delay: number;
      retry_backoff: boolean;
    }>(
      `select retry_limit, retry_delay, retry_backoff
         from pgboss.queue
         where name = $1`,
      [ATTACHMENTS_PURGE_QUEUE],
    );
    expect(row.rowCount).toBe(1);
    expect(row.rows[0]?.retry_limit).toBe(5);
    expect(row.rows[0]?.retry_delay).toBe(30);
    expect(row.rows[0]?.retry_backoff).toBe(true);
  });

  it('records the rate-limits queue in pgboss.queue with ADR-0009 retry config', async () => {
    const row = await dbHandle.pool.query<{
      retry_limit: number;
      retry_delay: number;
      retry_backoff: boolean;
    }>(
      `select retry_limit, retry_delay, retry_backoff
         from pgboss.queue
         where name = $1`,
      [RATE_LIMITS_PURGE_QUEUE],
    );
    expect(row.rowCount).toBe(1);
    expect(row.rows[0]?.retry_limit).toBe(5);
    expect(row.rows[0]?.retry_delay).toBe(30);
    expect(row.rows[0]?.retry_backoff).toBe(true);
  });
});

describe.skipIf(!runIntegration)('graceful shutdown ordering', () => {
  it('stops pg-boss before closing the Fastify app', async () => {
    process.env.NODE_ENV = 'test';
    const dbHandle = createDb(APP_URL);
    const boss = await initBoss({ connectionString: APP_URL });
    await registerCoreJobs(boss, {
      db: dbHandle.db,
      pool: dbHandle.pool,
      storage: stubStorage,
    });
    const app = await buildServer({ config: loadConfig(), dbHandle, boss, storage: stubStorage });
    await app.ready();

    const calls: string[] = [];
    const realBossStop = boss.stop.bind(boss);
    const realAppClose = app.close.bind(app);
    // We mock the methods directly (not via vi.spyOn) so we control the
    // signature freely — Fastify's `close` overload accepts an optional
    // callback that vi.spyOn struggles to type-check.
    (boss as unknown as { stop: typeof boss.stop }).stop = (async (
      ...args: Parameters<typeof realBossStop>
    ) => {
      calls.push('boss.stop:start');
      const result = await realBossStop(...args);
      calls.push('boss.stop:end');
      return result;
    }) as typeof boss.stop;
    (app as unknown as { close: () => Promise<undefined> }).close = (async () => {
      calls.push('app.close:start');
      const result = await realAppClose();
      calls.push('app.close:end');
      return result;
    }) as () => Promise<undefined>;

    // Replay the production shutdown sequence from src/index.ts.
    await shutdownBoss(boss);
    await app.close();
    await dbHandle.close();

    expect(calls).toEqual(['boss.stop:start', 'boss.stop:end', 'app.close:start', 'app.close:end']);
  });
});
