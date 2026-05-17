// Hourly purge of expired idempotency keys (ADR-0015:88).
//
// `core.idempotency_keys` rows live for 24 hours so retried mutating
// requests within that window are served from cache. After 24h the row is
// safe to drop. This handler runs once per hour on pg-boss.
//
// Why no audit row: ADR-0008 audit_log is for *domain* mutations. This is
// a system-internal cache eviction that touches no user-visible state.
// Logging it would just generate noise. The job payload carries a
// `correlation_id` so re-runs and retries are observable in app logs
// (ADR-0009:36).

import { sql } from 'drizzle-orm';
import type { PgBoss } from 'pg-boss';

import type { Db } from '../../../db/client.js';

/** Queue name. Format: `<module>.<action>` per ADR-0009. */
export const IDEMPOTENCY_PURGE_QUEUE = 'core.idempotency_purge';

/** Hourly cron: top of every hour. */
export const IDEMPOTENCY_PURGE_CRON = '0 * * * *';

export interface IdempotencyPurgePayload {
  correlation_id: string;
}

export interface IdempotencyPurgeResult {
  deleted: number;
}

/**
 * Pure handler — invoked by pg-boss workers and directly from unit tests.
 * Idempotent: re-running is a no-op once nothing older than 24h remains.
 */
export async function purgeExpiredIdempotencyKeys(deps: {
  db: Db;
}): Promise<IdempotencyPurgeResult> {
  const result = await deps.db.execute(
    sql`DELETE FROM core.idempotency_keys WHERE created_at < now() - interval '24 hours'`,
  );
  // drizzle's node-postgres execute returns a pg.QueryResult; rowCount is
  // the number of rows actually deleted.
  return { deleted: (result as { rowCount?: number }).rowCount ?? 0 };
}

/**
 * Test-only surface (H6, slice3-prologue): the inline `boss.work` callback
 * extracted as a named factory so a unit test can pin its error-propagation
 * contract without booting pg-boss. Errors thrown here MUST propagate so
 * pg-boss's retry config (ADR-0009:35) takes effect. Do not wrap in a
 * try/catch that swallows errors (e.g. "log and continue") — that would
 * silently defeat the retry contract.
 */
export function __purgeHandler(deps: {
  db: Db;
  log?: { info: (msg: string, meta?: unknown) => void };
}) {
  return async (jobs: Array<{ id: string; data: IdempotencyPurgePayload }>) => {
    for (const job of jobs) {
      const correlationId = job.data?.correlation_id ?? job.id;
      const { deleted } = await purgeExpiredIdempotencyKeys({ db: deps.db });
      deps.log?.info('core.idempotency_purge complete', {
        correlation_id: correlationId,
        deleted,
        job_id: job.id,
      });
    }
  };
}

/**
 * Wire the handler + hourly cron into pg-boss. Idempotent — re-running
 * registerCoreJobs on a fresh process must converge on the same set of
 * queues, workers, and schedules. ADR-0009:35 retry config is applied at
 * queue-create time so jobs inherit it.
 */
export async function registerIdempotencyPurge(
  boss: PgBoss,
  deps: { db: Db; log?: { info: (msg: string, meta?: unknown) => void } },
): Promise<void> {
  // F-010: fops_app no longer holds EXECUTE on `pgboss.create_queue` (per
  // migration 0003) because that function performs DDL (CREATE TABLE,
  // ATTACH PARTITION). Slice 1's single queue (`core.idempotency_purge`)
  // is pre-created in migration 0003 itself, so this boot path only has
  // to verify it exists. Future queues land via new migrations; the
  // running app never DDLs.
  const queues = await boss.getQueues([IDEMPOTENCY_PURGE_QUEUE]);
  if (queues.length === 0) {
    throw new Error(
      `pg-boss queue '${IDEMPOTENCY_PURGE_QUEUE}' is not pre-created. Run migrations (ADR-0008 + F-010).`,
    );
  }

  await boss.work<IdempotencyPurgePayload>(IDEMPOTENCY_PURGE_QUEUE, __purgeHandler(deps));

  // Schedule the hourly run. pg-boss `schedule` is idempotent on (name, key)
  // — calling it on every boot is safe and converges to the same row in
  // pgboss.schedule. The payload carries a fresh correlation_id per fire so
  // every run is traceable in logs.
  await boss.schedule(IDEMPOTENCY_PURGE_QUEUE, IDEMPOTENCY_PURGE_CRON, {
    correlation_id: 'cron',
  });
}
