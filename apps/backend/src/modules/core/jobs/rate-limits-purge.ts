// Hourly purge of expired rate-limit rows (F-018; ADR-0015:7-9).
//
// `core.rate_limits` rows live one upsert per `(key, route_group)`. The
// PgRateLimitStore resets `expires_at` on each call inside an active
// window, but unique anonymous-IP keys never come back, so without a purge
// the table grows unbounded. This handler runs hourly on pg-boss and
// deletes rows whose window ended more than an hour ago (the 1h grace
// keeps a row alive long enough for a slow client retry to coast on the
// same counter row instead of being treated as fresh traffic).
//
// Why no audit row: ADR-0008 audit_log is for *domain* mutations. This is
// a system-internal cache eviction with no user-visible state change.
// Sibling of `core.idempotency_purge` — same shape, separate queue + cron
// so a failure in one does not stall the other (ADR-0009 retry policy is
// per queue).

import { sql } from 'drizzle-orm';
import type { PgBoss } from 'pg-boss';

import type { Db } from '../../../db/client.js';

/** Queue name. Format: `<module>.<action>` per ADR-0009. */
export const RATE_LIMITS_PURGE_QUEUE = 'core.rate_limits_purge';

/** Hourly cron, offset 15 min from idempotency_purge to spread load. */
export const RATE_LIMITS_PURGE_CRON = '15 * * * *';

export interface RateLimitsPurgePayload {
  correlation_id: string;
}

export interface RateLimitsPurgeResult {
  deleted: number;
}

/**
 * Pure handler — invoked by pg-boss workers and directly from unit tests.
 * Idempotent: re-running is a no-op once nothing past the grace window
 * remains.
 */
export async function purgeExpiredRateLimits(deps: {
  db: Db;
}): Promise<RateLimitsPurgeResult> {
  const result = await deps.db.execute(
    sql`DELETE FROM core.rate_limits WHERE expires_at < now() - interval '1 hour'`,
  );
  return { deleted: (result as { rowCount?: number }).rowCount ?? 0 };
}

/**
 * Wire the handler + hourly cron into pg-boss. Idempotent — same contract
 * as `registerIdempotencyPurge`. Queue is pre-created in migration 0004
 * because fops_app does not hold EXECUTE on `pgboss.create_queue`'s DDL
 * branch (F-010 / ADR-0008).
 */
export async function registerRateLimitsPurge(
  boss: PgBoss,
  deps: { db: Db; log?: { info: (msg: string, meta?: unknown) => void } },
): Promise<void> {
  const queues = await boss.getQueues([RATE_LIMITS_PURGE_QUEUE]);
  if (queues.length === 0) {
    throw new Error(
      `pg-boss queue '${RATE_LIMITS_PURGE_QUEUE}' is not pre-created. Run migrations (ADR-0008 + F-018).`,
    );
  }

  await boss.work<RateLimitsPurgePayload>(
    RATE_LIMITS_PURGE_QUEUE,
    async (jobs: Array<{ id: string; data: RateLimitsPurgePayload }>) => {
      for (const job of jobs) {
        const correlationId = job.data?.correlation_id ?? job.id;
        const { deleted } = await purgeExpiredRateLimits({ db: deps.db });
        deps.log?.info('core.rate_limits_purge complete', {
          correlation_id: correlationId,
          deleted,
          job_id: job.id,
        });
      }
    },
  );

  await boss.schedule(RATE_LIMITS_PURGE_QUEUE, RATE_LIMITS_PURGE_CRON, {
    correlation_id: 'cron',
  });
}
