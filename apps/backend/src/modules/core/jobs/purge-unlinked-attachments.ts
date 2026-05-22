// Hourly purge of unlinked voc.voc_attachments rows (PLAN-22 C4b;
// ADR-0011 attachment lifecycle).
//
// POST /attachments inserts an attachment row in two phases: the raw row
// lands first (voc_id IS NULL AND comment_id IS NULL), then a follow-up
// link step (voc create / reporter-reply / internal-comment) populates
// voc_id or comment_id. If the link step never runs (client crash,
// abandoned flow) the row + its S3 object leak indefinitely. This job
// reclaims rows older than 24h plus their backing storage objects.
//
// Sibling of `core.idempotency_purge` and `core.rate_limits_purge` — same
// pg-boss + cron shape. Cron offset by 30 min so the three hourly jobs
// don't all run at the top of the hour.
//
// Failure policy (D-09 / plan §C4b): storage.delete is best-effort. If
// the upstream object store fails for one row, log the failure and SKIP
// the DB delete for that row so the next hourly run retries. We do NOT
// orphan the DB pointer by deleting the row when the storage tombstone
// failed — that would lose our only handle on the unreachable object.

import type pg from 'pg';
import type { PgBoss } from 'pg-boss';

import type { StorageBackend } from '../../../lib/storage/index.js';

/** Queue name. Format: `<module>.<action>` per ADR-0009. */
export const ATTACHMENTS_PURGE_QUEUE = 'core.attachments_purge';

/** Hourly cron, offset 30 min from idempotency_purge (0) and rate_limits_purge (15). */
export const ATTACHMENTS_PURGE_CRON = '30 * * * *';

export interface AttachmentsPurgePayload {
  correlation_id: string;
}

export interface AttachmentsPurgeResult {
  /** Number of DB rows successfully deleted. */
  count: number;
  /** Sum of size_bytes for rows successfully purged (DB row gone). */
  bytes_reclaimed: number;
  /** Rows whose storage.delete failed — DB row left in place for retry. */
  storage_delete_failures: number;
}

export interface PurgeUnlinkedAttachmentsDeps {
  pool: pg.Pool;
  storage: StorageBackend;
  log?: {
    info: (msg: string, meta?: unknown) => void;
    error: (msg: string, meta?: unknown) => void;
  };
}

interface AttachmentRow {
  id: string;
  storage_key: string;
  size_bytes: string | number; // bigint comes back as string from node-postgres
}

/**
 * Pure handler — invoked by pg-boss workers and directly from unit tests.
 *
 * For each unlinked row older than 24h:
 *   1. Try storage.delete(storage_key). If it throws, log + skip DB delete
 *      so the next run retries.
 *   2. If storage delete succeeded (or was a no-op for a missing key),
 *      DELETE the DB row by id. The size_bytes contributes to
 *      bytes_reclaimed.
 *
 * Idempotent: re-running once nothing older than 24h remains is a no-op.
 */
export async function purgeUnlinkedAttachments(
  deps: PurgeUnlinkedAttachmentsDeps,
): Promise<AttachmentsPurgeResult> {
  const { pool, storage, log } = deps;

  const candidates = await pool.query<AttachmentRow>(
    `SELECT id, storage_key, size_bytes
       FROM voc.voc_attachments
       WHERE voc_id IS NULL
         AND comment_id IS NULL
         AND created_at < now() - interval '24 hours'`,
  );

  let count = 0;
  let bytes_reclaimed = 0;
  let storage_delete_failures = 0;

  for (const row of candidates.rows) {
    const size = typeof row.size_bytes === 'string' ? Number(row.size_bytes) : row.size_bytes;

    try {
      await storage.delete(row.storage_key);
    } catch (err) {
      storage_delete_failures += 1;
      log?.error('core.attachments_purge storage.delete failed', {
        attachment_id: row.id,
        storage_key: row.storage_key,
        error: err instanceof Error ? err.message : String(err),
      });
      // Leave DB row in place — next hourly run will retry.
      continue;
    }

    const del = await pool.query('DELETE FROM voc.voc_attachments WHERE id = $1', [row.id]);
    if ((del.rowCount ?? 0) > 0) {
      count += 1;
      bytes_reclaimed += Number.isFinite(size) ? size : 0;
    }
  }

  log?.info('core.attachments_purge complete', {
    count,
    bytes_reclaimed,
    storage_delete_failures,
  });

  return { count, bytes_reclaimed, storage_delete_failures };
}

/**
 * Wire the handler + hourly cron into pg-boss. Idempotent — same contract
 * as `registerIdempotencyPurge` / `registerRateLimitsPurge`. Queue is
 * pre-created in migration 0014 because fops_app cannot DDL via
 * pgboss.create_queue (F-010 / ADR-0008).
 */
export async function registerAttachmentsPurge(
  boss: PgBoss,
  deps: {
    pool: pg.Pool;
    storage: StorageBackend;
    log?: {
      info: (msg: string, meta?: unknown) => void;
      error: (msg: string, meta?: unknown) => void;
    };
  },
): Promise<void> {
  const queues = await boss.getQueues([ATTACHMENTS_PURGE_QUEUE]);
  if (queues.length === 0) {
    throw new Error(
      `pg-boss queue '${ATTACHMENTS_PURGE_QUEUE}' is not pre-created. Run migrations (ADR-0008 + PLAN-22 C4b).`,
    );
  }

  await boss.work<AttachmentsPurgePayload>(
    ATTACHMENTS_PURGE_QUEUE,
    async (jobs: Array<{ id: string; data: AttachmentsPurgePayload }>) => {
      for (const job of jobs) {
        const correlationId = job.data?.correlation_id ?? job.id;
        const handlerDeps: PurgeUnlinkedAttachmentsDeps = deps.log
          ? { pool: deps.pool, storage: deps.storage, log: deps.log }
          : { pool: deps.pool, storage: deps.storage };
        const result = await purgeUnlinkedAttachments(handlerDeps);
        deps.log?.info('core.attachments_purge complete', {
          correlation_id: correlationId,
          job_id: job.id,
          ...result,
        });
      }
    },
  );

  await boss.schedule(ATTACHMENTS_PURGE_QUEUE, ATTACHMENTS_PURGE_CRON, {
    correlation_id: 'cron',
  });
}
