// Route-level tests for the k8s liveness/readiness split (ADR-0013, amended
// 2026-09-22). DB-gated like server.test.ts: healthy baselines need a real
// Postgres to prove `select 1` passes through buildServer. pg-boss and
// storage are fakes injected via buildServer opts; the database check is
// failed or hung by swapping the pool on the DbHandle.

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { loadConfig } from './config.js';
import { type DbHandle, createDb } from './db/client.js';
import type { StorageBackend } from './lib/storage/index.js';
import { buildServer } from './server.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && WORKSPACE_ID);

const DSN = 'postgres://user:s3cr3t@db/x';
const AWS_KEY = 'AKIAEXAMPLEKEY';

const okBoss = {
  getDb: () => ({ executeSql: async () => ({ rows: [] }) }),
} as unknown as PgBoss;
const okStorage = {
  exists: async () => false,
} as unknown as StorageBackend;

const failBoss = {
  getDb: () => ({
    executeSql: async () => {
      throw new Error(`pg-boss down ${DSN}`);
    },
  }),
} as unknown as PgBoss;
const failStorage = {
  exists: async () => {
    throw new Error(`NoSuchBucket ${AWS_KEY}`);
  },
} as unknown as StorageBackend;

// Intentionally never-settling fixtures (hang simulation). Executor form with
// unused resolvers; `Promise.withResolvers` is outside the repo's ES2023 lib.
const hangPool = {
  query: () => new Promise<never>(() => {}),
} as unknown as pg.Pool;
const hangBoss = {
  getDb: () => ({ executeSql: () => new Promise<never>(() => {}) }),
} as unknown as PgBoss;
const hangStorage = {
  exists: () => new Promise<never>(() => {}),
} as unknown as StorageBackend;

describe.skipIf(!runIntegration)('health probes (ADR-0013)', () => {
  let sharedDbHandle: DbHandle;
  const openApps: FastifyInstance[] = [];

  interface Overrides {
    pool?: pg.Pool | undefined;
    // `boss: undefined` is meaningful: buildServer without a boss handle
    // must fail the pg_boss check closed.
    boss?: PgBoss | undefined;
    storage?: StorageBackend | undefined;
    healthProbeTimeoutMs?: number | undefined;
  }

  const buildApp = async (over: Overrides = {}): Promise<FastifyInstance> => {
    const dbHandle = over.pool ? { ...sharedDbHandle, pool: over.pool } : sharedDbHandle;
    const boss = 'boss' in over ? over.boss : okBoss;
    const app = await buildServer({
      config: loadConfig(),
      dbHandle,
      ...(boss !== undefined ? { boss } : {}),
      storage: over.storage ?? okStorage,
      ...(over.healthProbeTimeoutMs !== undefined
        ? { healthProbeTimeoutMs: over.healthProbeTimeoutMs }
        : {}),
    });
    await app.ready();
    openApps.push(app);
    return app;
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    sharedDbHandle = createDb(APP_URL);
  });

  afterAll(async () => {
    for (const app of openApps) await app.close();
    await sharedDbHandle?.close();
  });

  test('healthy baseline: live and ready return 200 with every check ok, no cookie', async () => {
    const app = await buildApp();

    const live = await app.inject({ method: 'GET', url: '/health/live' });
    expect(live.statusCode).toBe(200);
    expect(live.json()).toEqual({ status: 'ok' });

    // No session cookie injected — probes must be reachable unauthenticated.
    const ready = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({
      status: 'ok',
      checks: { database: 'ok', pg_boss: 'ok', storage: 'ok' },
    });
  });

  test('database failing: 503 with only database down; body never carries the DSN', async () => {
    const baseline = await buildApp();
    const okRes = await baseline.inject({ method: 'GET', url: '/health/ready' });
    expect(okRes.statusCode).toBe(200); // same fixture with a working pool

    const app = await buildApp({
      pool: {
        query: async () => {
          throw new Error(`connect ECONNREFUSED ${DSN}`);
        },
      } as unknown as pg.Pool,
    });
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      status: 'unavailable',
      checks: { database: 'fail', pg_boss: 'ok', storage: 'ok' },
    });
    const body = JSON.stringify(res.json());
    expect(body).not.toContain('postgres://');
    expect(body).not.toContain('s3cr3t');
  });

  test('pg-boss failing: 503 with only pg_boss down (handle present, executeSql rejects)', async () => {
    const baseline = await buildApp({ boss: okBoss });
    const okRes = await baseline.inject({ method: 'GET', url: '/health/ready' });
    expect(okRes.statusCode).toBe(200);

    const app = await buildApp({ boss: failBoss });
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      status: 'unavailable',
      checks: { database: 'ok', pg_boss: 'fail', storage: 'ok' },
    });
    expect(JSON.stringify(res.json())).not.toContain('s3cr3t');
  });

  test('pg-boss missing: 503 fail closed when buildServer gets no boss handle', async () => {
    const baseline = await buildApp({ boss: okBoss });
    const okRes = await baseline.inject({ method: 'GET', url: '/health/ready' });
    expect(okRes.statusCode).toBe(200);

    const app = await buildApp({ boss: undefined });
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      status: 'unavailable',
      checks: { database: 'ok', pg_boss: 'fail', storage: 'ok' },
    });
  });

  test('storage failing: 503 with only storage down; body never carries the AWS key', async () => {
    const baseline = await buildApp({ storage: okStorage });
    const okRes = await baseline.inject({ method: 'GET', url: '/health/ready' });
    expect(okRes.statusCode).toBe(200);

    const app = await buildApp({ storage: failStorage });
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      status: 'unavailable',
      checks: { database: 'ok', pg_boss: 'ok', storage: 'fail' },
    });
    const body = JSON.stringify(res.json());
    expect(body).not.toContain(AWS_KEY);
    expect(body).not.toContain('AKIA');
  });

  test('hung dependencies: 503 within the timeout bound, all three checks failed', async () => {
    // Real wall-clock is required here: the 50ms budget is enforced by the
    // server-side withTimeout timer, which fake timers cannot reach across
    // app.inject (stubbing global timers would break fastify internals).
    const baseline = await buildApp({ healthProbeTimeoutMs: 50 });
    const okRes = await baseline.inject({ method: 'GET', url: '/health/ready' });
    expect(okRes.statusCode).toBe(200); // healthy fixture passes the 50ms budget

    const app = await buildApp({
      healthProbeTimeoutMs: 50,
      pool: hangPool,
      boss: hangBoss,
      storage: hangStorage,
    });
    const started = Date.now();
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      status: 'unavailable',
      checks: { database: 'fail', pg_boss: 'fail', storage: 'fail' },
    });
  });

  test('liveness stays 200 while every dependency hangs', async () => {
    const app = await buildApp({
      healthProbeTimeoutMs: 50,
      pool: hangPool,
      boss: hangBoss,
      storage: hangStorage,
    });
    const res = await app.inject({ method: 'GET', url: '/health/live' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  test('probes are exempt from the rate limit: 60 rapid ready calls, none 429', async () => {
    const app = await buildApp();
    const responses = await Promise.all(
      Array.from({ length: 60 }, () => app.inject({ method: 'GET', url: '/health/ready' })),
    );
    const statuses = responses.map((res) => res.statusCode);
    expect(statuses).not.toContain(429);
    expect(statuses.every((status) => status === 200)).toBe(true);
  });

  test('probes opt out of the limiter per route: no rate-limit headers, even with a session cookie', async () => {
    const app = await buildApp();
    for (const url of ['/health/live', '/health/ready']) {
      const res = await app.inject({
        method: 'GET',
        url,
        headers: { cookie: 'fops_session=not-a-real-session' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['x-ratelimit-limit']).toBeUndefined();
    }
    // Control: a normal route DOES carry limiter headers, so the absence above is meaningful.
    const control = await app.inject({ method: 'GET', url: '/me' });
    expect(control.headers['x-ratelimit-limit']).toBeDefined();
  });

  test('a missing bucket (exists=false, ping rejects) is not ready', async () => {
    const storage = {
      exists: async () => false,
      ping: async () => {
        throw new Error(`NoSuchBucket ${AWS_KEY}`);
      },
    } as unknown as StorageBackend;
    const app = await buildApp({ storage });
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json().checks).toEqual({ database: 'ok', pg_boss: 'ok', storage: 'fail' });
    expect(res.body).not.toContain(AWS_KEY);
  });
});
