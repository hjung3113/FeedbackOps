// #168 step 3 — cron backfill for VOC embeddings (ADR-0034 D6).
//
// Enqueue-on-write is best effort by design (see `embedding/enqueue.ts`); this
// job is the durable guarantee. It is also the migration path for D2's model
// swap: bumping EMBEDDING_VERSION makes every VOC "missing at the active
// version", and this job walks the corpus in bounded batches.

import type { PgBoss } from 'pg-boss';

import type { Db } from '../../../db/client.js';
import {
  countVocsMissingEmbedding,
  selectVocsMissingEmbedding,
} from '../embedding/repo.js';
import { VOC_EMBED_QUEUE, type VocEmbedPayload } from './embed-voc.js';

/** Queue name. Format: `<module>.<action>` per ADR-0009. */
export const VOC_EMBEDDING_BACKFILL_QUEUE = 'voc.embedding_backfill';

/** Every 15 minutes. Fast enough to be a real safety net for a dropped enqueue. */
export const VOC_EMBEDDING_BACKFILL_CRON = '*/15 * * * *';

/**
 * VOCs enqueued per run. 200 × 4 runs/hour = 800 VOCs/hour of catch-up, which
 * drains a version bump on a realistic workspace within a day while capping
 * the provider spend and queue depth any single run can create. Whatever does
 * not fit is reported as `remaining`, never silently dropped.
 */
export const VOC_EMBEDDING_BACKFILL_BATCH_SIZE = 200;

export interface VocEmbeddingBackfillPayload {
  correlation_id: string;
}

export interface VocEmbeddingBackfillResult {
  enqueued: number;
  /** Still missing after this run — the number the next run will pick up. */
  remaining: number;
  /** True when the provider is disabled and the run was a deliberate no-op. */
  skipped: boolean;
}

export interface VocEmbeddingBackfillDeps {
  db: Db;
  boss: PgBoss;
  embeddingVersion: number;
  embeddingEnabled: boolean;
  batchSize?: number;
  log?: {
    info: (msg: string, meta?: unknown) => void;
    error: (msg: string, meta?: unknown) => void;
  };
}

/**
 * Enqueue up to `batchSize` VOCs that have no embedding at the active version.
 *
 * Disabled provider: enqueues nothing and returns `skipped: true` (ADR-0034
 * D2 — "ingestion enqueues nothing"). Without this gate a disabled environment
 * would enqueue its whole corpus every 15 minutes forever.
 *
 * A per-VOC send failure does not abandon the batch: the remaining VOCs are
 * still worth enqueuing, and anything that failed is by definition still
 * missing, so the next run retries it.
 */
export async function backfillVocEmbeddings(
  deps: VocEmbeddingBackfillDeps,
  payload: VocEmbeddingBackfillPayload,
): Promise<VocEmbeddingBackfillResult> {
  if (!deps.embeddingEnabled) {
    deps.log?.info('voc.embedding_backfill skipped: embedding provider disabled', {
      correlation_id: payload.correlation_id,
    });
    return { enqueued: 0, remaining: 0, skipped: true };
  }

  const batchSize = deps.batchSize ?? VOC_EMBEDDING_BACKFILL_BATCH_SIZE;
  const missingTotal = await countVocsMissingEmbedding(deps.db, {
    embeddingVersion: deps.embeddingVersion,
  });
  const batch = await selectVocsMissingEmbedding(deps.db, {
    embeddingVersion: deps.embeddingVersion,
    limit: batchSize,
  });

  let enqueued = 0;
  for (const row of batch) {
    const jobPayload: VocEmbedPayload = {
      workspace_id: row.workspace_id,
      voc_id: row.voc_id,
      correlation_id: payload.correlation_id,
    };
    try {
      await deps.boss.send(VOC_EMBED_QUEUE, jobPayload);
      enqueued += 1;
    } catch (err) {
      deps.log?.error('voc.embedding_backfill enqueue failed', {
        voc_id: row.voc_id,
        correlation_id: payload.correlation_id,
        err,
      });
    }
  }

  const remaining = Math.max(missingTotal - enqueued, 0);
  deps.log?.info('voc.embedding_backfill complete', {
    correlation_id: payload.correlation_id,
    embedding_version: deps.embeddingVersion,
    batch_size: batchSize,
    enqueued,
    // The bound is explicit in the log, not hidden in a LIMIT: an operator can
    // see that work was left for the next run.
    remaining,
  });
  return { enqueued, remaining, skipped: false };
}

export function vocEmbeddingBackfillHandler(deps: VocEmbeddingBackfillDeps) {
  return async (jobs: Array<{ id: string; data: VocEmbeddingBackfillPayload }>) => {
    for (const job of jobs) {
      await backfillVocEmbeddings(deps, {
        correlation_id: job.data?.correlation_id ?? job.id,
      });
    }
  };
}

export async function registerVocEmbeddingBackfill(
  boss: PgBoss,
  deps: Omit<VocEmbeddingBackfillDeps, 'boss'>,
): Promise<void> {
  const queues = await boss.getQueues([VOC_EMBEDDING_BACKFILL_QUEUE]);
  if (queues.length === 0) {
    throw new Error(
      `pg-boss queue '${VOC_EMBEDDING_BACKFILL_QUEUE}' is not pre-created. Run migrations (ADR-0009).`,
    );
  }
  await boss.work<VocEmbeddingBackfillPayload>(
    VOC_EMBEDDING_BACKFILL_QUEUE,
    vocEmbeddingBackfillHandler({ ...deps, boss }),
  );
  // `schedule` is idempotent on (name, key); every boot converges to the same
  // pgboss.schedule row. Registered unconditionally — including when the
  // provider is disabled — so enabling a provider needs no re-registration;
  // the handler itself is the no-op in that state.
  await boss.schedule(VOC_EMBEDDING_BACKFILL_QUEUE, VOC_EMBEDDING_BACKFILL_CRON, {
    correlation_id: 'cron',
  });
}
