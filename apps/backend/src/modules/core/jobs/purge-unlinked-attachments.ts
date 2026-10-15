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

import { type JobLog, JOB_WORK_OPTIONS, errorFields, withJobLogging } from '../../../lib/job-log.js';
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
  log?: JobLog;
  /** Test barrier after candidate selection, before entering the claim transaction. */
  beforeClaim?: (attachmentId: string) => Promise<void>;
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
 *   1. Lock and re-check the candidate in a short transaction, then archive
 *      the still-unlinked row. Commit before touching storage. The link UPDATE
 *      takes the same row lock and excludes archived rows, so only one wins.
 *   2. Delete storage. Failure leaves the claim for the next hourly retry.
 *   3. Delete only a still-unlinked, claimed row; count successful DB deletes.
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

  for (const candidate of candidates.rows) {
    await deps.beforeClaim?.(candidate.id);
    const client = await pool.connect();
    let row: AttachmentRow | undefined;
    try {
      await client.query('BEGIN');
      const locked = await client.query<AttachmentRow>(
        `SELECT id, storage_key, size_bytes FROM voc.voc_attachments
          WHERE id = $1 AND voc_id IS NULL AND comment_id IS NULL
            AND created_at < now() - interval '24 hours'
          FOR UPDATE`,
        [candidate.id],
      );
      row = locked.rows[0];
      if (row) {
        // Preserve an existing claim: failed storage deletes are retried.
        // Only unlinked rows are archived here, so active linked projections
        // retain their existing archive semantics.
        await client.query(
          'UPDATE voc.voc_attachments SET archived_at = coalesce(archived_at, now()) WHERE id = $1',
          [row.id],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    if (!row) continue;

    const size = typeof row.size_bytes === 'string' ? Number(row.size_bytes) : row.size_bytes;

    try {
      await storage.delete(row.storage_key);
    } catch (err) {
      storage_delete_failures += 1;
      log?.error('core.attachments_purge storage.delete failed', {
        attachment_id: row.id,
        storage_key: row.storage_key,
        ...errorFields(err),
      });
      // Leave DB row in place — next hourly run will retry.
      continue;
    }

    const del = await pool.query(
      `DELETE FROM voc.voc_attachments WHERE id = $1
        AND archived_at IS NOT NULL AND voc_id IS NULL AND comment_id IS NULL`,
      [row.id],
    );
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
    log: JobLog;
  },
): Promise<void> {
  const queues = await boss.getQueues([ATTACHMENTS_PURGE_QUEUE]);
  if (queues.length === 0) {
    throw new Error(
      `pg-boss queue '${ATTACHMENTS_PURGE_QUEUE}' is not pre-created. Run migrations (ADR-0008 + PLAN-22 C4b).`,
    );
  }

  const handler = async (jobs: Array<{ id: string; data: AttachmentsPurgePayload }>) => {
    for (const job of jobs) {
      const correlationId = job.data?.correlation_id ?? job.id;
      const result = await purgeUnlinkedAttachments({
        pool: deps.pool,
        storage: deps.storage,
        log: deps.log,
      });
      deps.log?.info('core.attachments_purge complete', {
        correlation_id: correlationId,
        job_id: job.id,
        ...result,
      });
    }
  };

  await boss.work<AttachmentsPurgePayload>(
    ATTACHMENTS_PURGE_QUEUE,
    JOB_WORK_OPTIONS,
    withJobLogging(deps.log, ATTACHMENTS_PURGE_QUEUE, handler),
  );

  await boss.schedule(ATTACHMENTS_PURGE_QUEUE, ATTACHMENTS_PURGE_CRON, {
    correlation_id: 'cron',
  });
}
