// Background job runtime helpers (ADR-0009).
//
// `initBoss` constructs a pg-boss instance against the same Postgres reachable
// via DATABASE_URL (fops_app role). pg-boss's own bootstrap migrations are
// disabled — the `pgboss` schema, tables, and stored functions are installed
// by Drizzle migration 0002 running as fops_migrate, so the running app never
// needs DDL privileges (option (A) in the Slice 1 spec; ADR-0008 spirit).
//
// `shutdownBoss` resolves only after pg-boss has finished stopping. Callers
// invoke this BEFORE closing the Fastify app and the Drizzle pool so in-flight
// jobs see a clean database (ADR-0009: graceful shutdown).

import { PgBoss } from 'pg-boss';

import type { JobLog } from './job-log.js';

export type Boss = PgBoss;

export interface InitBossOptions {
  connectionString: string;
  /**
   * Structured logger (ADR-0013, amended 2026-09-22). Required: pg-boss
   * emits 'error' and 'warning' events; they must reach the process root
   * logger instead of being swallowed.
   */
  log: JobLog;
}

export async function initBoss(opts: InitBossOptions): Promise<Boss> {
  const boss = new PgBoss({
    connectionString: opts.connectionString,
    schema: 'pgboss',
    // ADR-0008 + Slice 1 spec choice (A): the running fops_app role has no
    // DDL on pgboss.*; the schema is owned by migration 0002. If pg-boss is
    // upgraded to a new schema version, a follow-up Drizzle migration runs
    // `getMigrationPlans('pgboss', N)` as fops_migrate. Boot must never
    // try to migrate from the request-handling process.
    migrate: false,
    createSchema: false,
    // Maintenance + cron scheduling stay on; they only need DML.
    supervise: true,
    schedule: true,
  });

  boss.on('error', (err: unknown) => opts.log.error('pg-boss error', { err }));
  boss.on('warning', (warning: unknown) => opts.log.warn('pg-boss warning', { warning }));

  await boss.start();
  return boss;
}

export interface ShutdownBossOptions {
  /**
   * Hard upper bound on how long to wait for in-flight jobs. pg-boss default
   * is 30s; we mirror that. SIGTERM tests rely on this resolving deterministically.
   */
  timeoutMs?: number;
}

export async function shutdownBoss(boss: Boss, opts: ShutdownBossOptions = {}): Promise<void> {
  const timeout = opts.timeoutMs ?? 30_000;
  // graceful=true waits for in-flight jobs; close=true closes the pool.
  // pg-boss emits 'stopped' once everything has wound down; we resolve when
  // boss.stop() itself resolves, which already awaits the graceful drain.
  await boss.stop({ graceful: true, close: true, timeout });
}
