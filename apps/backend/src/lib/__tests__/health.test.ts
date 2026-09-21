// Unit tests for the readiness-probe helpers (ADR-0013, amended 2026-09-22).
//
// All dependencies are fakes — no database, no pg-boss, no object store.
// Covers: healthy baseline (missing storage key = reachable), per-check
// isolation on failure, fail-closed pg-boss, hang-boundedness under a tiny
// budget (with a healthy twin proving the budget itself is not the cause),
// parallel execution, timer hygiene, and the no-secrets guarantee for both
// the result object and the server-side log payload.

import type pg from 'pg';
import type { PgBoss } from 'pg-boss';
import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_HEALTH_PROBE_TIMEOUT_MS,
  DependencyUnavailableError,
  HealthProbeTimeoutError,
  type ReadinessCheckOptions,
  runReadinessChecks,
  withTimeout,
} from '../health.js';
import type { StorageBackend } from '../storage/index.js';

const DSN = 'postgres://user:s3cr3t@db/x';
const AWS_KEY = 'AKIAEXAMPLEKEY';

const okPool = {
  query: async () => ({ rows: [{ '?column?': 1 }] }),
} as unknown as pg.Pool;
const okBoss = {
  getDb: () => ({ executeSql: async () => ({ rows: [] }) }),
} as unknown as PgBoss;
// exists resolving false (missing key) means reachable — contract, not a
// stub artifact.
const okStorage = {
  exists: async () => false,
} as unknown as StorageBackend;

const failPool = {
  query: async () => {
    throw new Error(`connect ECONNREFUSED ${DSN}`);
  },
} as unknown as pg.Pool;
const failBoss = {
  getDb: () => ({
    executeSql: async () => {
      throw new Error(`pg-boss crashed ${DSN}`);
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

const healthyOpts = (): ReadinessCheckOptions => ({
  pool: okPool,
  boss: okBoss,
  storage: okStorage,
  log: { warn: vi.fn() },
});

describe('withTimeout', () => {
  it('resolves with the wrapped value and leaves no timer behind', async () => {
    vi.useFakeTimers();
    try {
      expect(await withTimeout(Promise.resolve('value'), 10_000)).toBe('value');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects with HealthProbeTimeoutError on expiry and clears its timer', async () => {
    vi.useFakeTimers();
    try {
      const neverSettles = new Promise<string>(() => {});
      const hung = withTimeout(neverSettles, 1000);
      const expectation = expect(hung).rejects.toBeInstanceOf(HealthProbeTimeoutError);
      vi.advanceTimersByTime(1000);
      await expectation;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('runReadinessChecks', () => {
  it('uses the documented default timeout of 2000ms', () => {
    expect(DEFAULT_HEALTH_PROBE_TIMEOUT_MS).toBe(2000);
  });

  it('reports all checks ok on the healthy baseline (storage false = reachable)', async () => {
    const result = await runReadinessChecks(healthyOpts());
    expect(result).toEqual({
      ok: true,
      checks: { database: 'ok', pg_boss: 'ok', storage: 'ok' },
    });
  });

  it('isolates a failing database check', async () => {
    const result = await runReadinessChecks({ ...healthyOpts(), pool: failPool });
    expect(result.ok).toBe(false);
    expect(result.checks).toEqual({ database: 'fail', pg_boss: 'ok', storage: 'ok' });
  });

  it('isolates a failing pg-boss check', async () => {
    const result = await runReadinessChecks({ ...healthyOpts(), boss: failBoss });
    expect(result.ok).toBe(false);
    expect(result.checks).toEqual({ database: 'ok', pg_boss: 'fail', storage: 'ok' });
  });

  it('fails closed when the pg-boss handle is missing', async () => {
    const log = { warn: vi.fn() };
    const opts: ReadinessCheckOptions = { ...healthyOpts(), log };
    // buildServer called without boss — tests only; production always passes one.
    opts.boss = undefined;
    const result = await runReadinessChecks(opts);
    expect(result.ok).toBe(false);
    expect(result.checks).toEqual({ database: 'ok', pg_boss: 'fail', storage: 'ok' });
    expect(log.warn).toHaveBeenCalledWith({
      check: 'pg_boss',
      errName: DependencyUnavailableError.name,
    });
  });

  it('isolates a failing storage check', async () => {
    const result = await runReadinessChecks({ ...healthyOpts(), storage: failStorage });
    expect(result.ok).toBe(false);
    expect(result.checks).toEqual({ database: 'ok', pg_boss: 'ok', storage: 'fail' });
  });

  it('bounds hung dependencies: 50ms budget fails all three deterministically', async () => {
    vi.useFakeTimers();
    try {
      const log = { warn: vi.fn() };
      const pending = runReadinessChecks({
        ...healthyOpts(),
        pool: hangPool,
        boss: hangBoss,
        storage: hangStorage,
        log,
        timeoutMs: 50,
      });
      await vi.advanceTimersByTimeAsync(50);
      const result = await pending;
      expect(result.ok).toBe(false);
      expect(result.checks).toEqual({ database: 'fail', pg_boss: 'fail', storage: 'fail' });
      expect(log.warn).toHaveBeenCalledWith({
        check: 'database',
        errName: HealthProbeTimeoutError.name,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('same fixture resolving immediately still passes with the 50ms budget', async () => {
    const result = await runReadinessChecks({ ...healthyOpts(), timeoutMs: 50 });
    expect(result.ok).toBe(true);
  });

  it('runs the three checks in parallel (serial execution deadlocks the gate)', async () => {
    // Each dependency resolves only once all three have STARTED. Serial
    // execution would leave the first probe waiting forever (test timeout)
    // because the gate needs the later probes to have started — so this
    // passes only when the checks actually overlap. Executor form is
    // required to hold the resolver; withResolvers is outside ES2023 lib.
    let started = 0;
    let openGate = () => {};
    const gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });
    const arrive = async () => {
      started += 1;
      if (started === 3) openGate();
      await gate;
    };
    const gatedDep = async () => {
      await arrive();
      return { rows: [] };
    };
    const result = await runReadinessChecks({
      ...healthyOpts(),
      pool: { query: gatedDep } as unknown as pg.Pool,
      boss: { getDb: () => ({ executeSql: gatedDep }) } as unknown as PgBoss,
      storage: {
        exists: async () => {
          await arrive();
          return false;
        },
      } as unknown as StorageBackend,
    });
    expect(started).toBe(3);
    expect(result.ok).toBe(true);
  });

  it('never carries error text into the result or the log payload', async () => {
    const log = { warn: vi.fn() };
    const result = await runReadinessChecks({
      ...healthyOpts(),
      pool: failPool,
      boss: failBoss,
      storage: failStorage,
      log,
    });
    expect(result.ok).toBe(false);
    for (const serialized of [JSON.stringify(result), JSON.stringify(log.warn.mock.calls)]) {
      expect(serialized).not.toContain(DSN);
      expect(serialized).not.toContain('s3cr3t');
      expect(serialized).not.toContain(AWS_KEY);
    }
    expect(log.warn).toHaveBeenCalledWith({ check: 'database', errName: 'Error' });
    expect(log.warn).toHaveBeenCalledWith({ check: 'pg_boss', errName: 'Error' });
    expect(log.warn).toHaveBeenCalledWith({ check: 'storage', errName: 'Error' });
  });
});
