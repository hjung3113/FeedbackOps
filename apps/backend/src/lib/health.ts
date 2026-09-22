// Health-probe helpers for the Kubernetes liveness/readiness split
// (ADR-0013 "Health endpoints", amended 2026-09-22).
//
// Contract:
//   * `GET /health/live` depends on NOTHING downstream — the route lives in
//     modules/core/health/routes.ts; this module only serves readiness.
//   * `GET /health/ready` probes Postgres, pg-boss, and attachment storage
//     in parallel, each bounded by its own timeout (default 2000 ms), so a
//     hanging dependency yields 503 within roughly the timeout instead of
//     hanging the probe. Timers are always cleared, so a settled probe
//     leaves no dangling timer that could keep the process alive.
//   * Results are fixed-shape and non-sensitive: `{ ok, checks }` with
//     'ok' | 'fail' per check. Error MESSAGES are never included (they can
//     embed DSNs or credentials); failures are logged server-side with the
//     error NAME only via `log.warn({ check, errName })`.
//   * pg-boss and storage fail closed: a missing boss handle, a thrown
//     error, or a timeout all count as 'fail'.
//   * A timed-out probe keeps running (its connection stays held), so each
//     check is coalesced: while a call is unsettled, concurrent probes share
//     it, and once a probe timed out on it later probes fail without
//     attaching again (bounded connections AND memory).

import type pg from 'pg';
import type { PgBoss } from 'pg-boss';

import type { StorageBackend } from './storage/index.js';

/** Default per-check budget for `GET /health/ready` (ADR-0013). */
export const DEFAULT_HEALTH_PROBE_TIMEOUT_MS = 2000;

/**
 * Key probed via `storage.exists`. A resolved `false` (key missing) means
 * the store answered, so the dependency is reachable.
 */
export const STORAGE_PROBE_KEY = '__readiness_probe__';

export type HealthCheckName = 'database' | 'pg_boss' | 'storage';
export type HealthCheckStatus = 'ok' | 'fail';

export interface ReadinessChecks {
  database: HealthCheckStatus;
  pg_boss: HealthCheckStatus;
  storage: HealthCheckStatus;
}

export interface ReadinessResult {
  ok: boolean;
  checks: ReadinessChecks;
}

/**
 * Structural subset of the pino request logger. Kept minimal so health.ts
 * stays decoupled from fastify/pino types (unit tests pass a stub).
 */
export interface HealthLog {
  warn(obj: object, msg?: string): void;
}

/** Thrown by `withTimeout` when the wrapped promise outlives its budget. */
export class HealthProbeTimeoutError extends Error {
  override readonly name = 'HealthProbeTimeoutError';

  constructor() {
    super('health probe timed out');
  }
}

/** Raised when a check cannot even be attempted (e.g. no pg-boss handle). */
export class DependencyUnavailableError extends Error {
  override readonly name = 'DependencyUnavailableError';

  constructor(check: HealthCheckName) {
    super(`dependency unavailable: ${check}`);
  }
}

/**
 * Race `promise` against a timer that rejects after `ms`. The timer is
 * cleared once the race settles, so a fast dependency leaves no dangling
 * timer behind. A losing promise that later rejects is harmless:
 * Promise.race attached handlers to it, so the rejection is swallowed.
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new HealthProbeTimeoutError()), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** One unsettled call per check, plus whether a probe already gave up on it. */
export interface InFlightProbe {
  op: Promise<unknown>;
  timedOut: boolean;
}

/**
 * Run one probe, mapping any failure (throw or timeout) to 'fail'. Logs the
 * error NAME only — never the message, cause, or stack, which can carry
 * DSNs or credentials.
 *
 * Coalesced (single-flight): `withTimeout` only stops WAITING; the underlying
 * call keeps holding its connection. While a call for this check is still
 * unsettled, concurrent probes await THAT same promise (each within its own
 * timeout) instead of issuing another. Once a probe has timed out on it, later
 * probes fail immediately WITHOUT attaching to the promise again, so a
 * permanently hung dependency pins one connection and one reaction per check
 * no matter how often kubelet probes (no unbounded growth).
 */
async function probe(
  check: HealthCheckName,
  log: HealthLog,
  inFlight: Map<HealthCheckName, InFlightProbe>,
  timeoutMs: number,
  run: () => Promise<unknown>,
): Promise<HealthCheckStatus> {
  try {
    let entry = inFlight.get(check);
    if (entry?.timedOut) throw new HealthProbeTimeoutError();
    if (!entry) {
      const started: InFlightProbe = { op: run(), timedOut: false };
      entry = started;
      inFlight.set(check, started);
      const release = () => {
        if (inFlight.get(check) === started) inFlight.delete(check);
      };
      started.op.then(release, release);
    }
    try {
      await withTimeout(entry.op, timeoutMs);
    } catch (err) {
      if (err instanceof HealthProbeTimeoutError) entry.timedOut = true;
      throw err;
    }
    return 'ok';
  } catch (err) {
    log.warn({ check, errName: err instanceof Error ? err.name : 'Unknown' });
    return 'fail';
  }
}

export interface ReadinessCheckOptions {
  pool: pg.Pool;
  /** pg-boss handle. `undefined` fails the check closed; production always passes one. */
  boss?: PgBoss | undefined;
  storage: StorageBackend;
  timeoutMs?: number | undefined;
  log: HealthLog;
  /**
   * Unsettled calls per check, shared by later probes (see `probe`). Owned by
   * the caller (one Map per server) so state survives across requests;
   * omitted = a fresh Map per call (no cross-call coalescing; unit tests).
   */
  inFlight?: Map<HealthCheckName, InFlightProbe> | undefined;
}

/**
 * Probe all three dependencies in parallel. Resolves (never throws) with a
 * fixed-shape result; `ok` is true only when every check passed.
 */
export async function runReadinessChecks(opts: ReadinessCheckOptions): Promise<ReadinessResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_HEALTH_PROBE_TIMEOUT_MS;
  const inFlight = opts.inFlight ?? new Map<HealthCheckName, InFlightProbe>();

  const [database, pgBoss, storage] = await Promise.all([
    probe('database', opts.log, inFlight, timeoutMs, () => opts.pool.query('select 1')),
    probe('pg_boss', opts.log, inFlight, timeoutMs, async () => {
      const boss = opts.boss;
      if (!boss) throw new DependencyUnavailableError('pg_boss');
      // Cheapest real round trip on pg-boss v12: the internal handle's
      // executeSql (no queue-table scan like getQueues()).
      await boss.getDb().executeSql('select 1');
    }),
    // Prefer the bucket-level ping (HeadBucket): exists() would report a
    // deleted bucket as "reachable" because both cases 404.
    probe('storage', opts.log, inFlight, timeoutMs, () =>
      opts.storage.ping ? opts.storage.ping() : opts.storage.exists(STORAGE_PROBE_KEY),
    ),
  ]);

  const checks: ReadinessChecks = { database, pg_boss: pgBoss, storage };
  return { ok: database === 'ok' && pgBoss === 'ok' && storage === 'ok', checks };
}
