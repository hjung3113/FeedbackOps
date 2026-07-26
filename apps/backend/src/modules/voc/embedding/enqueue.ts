// #168 step 3 — enqueue-on-write for VOC embeddings (ADR-0034 D6).
//
// The boundary this file exists to hold: **a VOC write must never fail because
// the embedding queue failed.** A VOC is user-authored durable state; its
// embedding is a derived index that the cron backfill can always rebuild. If
// the two ever conflict, the VOC wins.
//
// Two consequences follow, and both are deliberate:
//
//  1. `boss.send` runs on pg-boss's own pool, NOT on the caller's transaction
//     (contrast `modules/tasks/service.ts`, which passes `db: fromDrizzle(tx)`
//     because a lost review candidate is a lost obligation). A transactional
//     send would enlist in the caller's transaction, so a send that fails with
//     a SQL error aborts that transaction and takes the VOC down with it.
//  2. Every failure is caught and logged. The caller is not told, because
//     there is nothing the caller could usefully do.
//
// The cost is that the job is visible to workers before the VOC row commits.
// `START_AFTER_SECONDS` covers that window, and the handler's `voc_not_found`
// branch plus the cron backfill cover the remainder.
//
// How far the backfill actually rescues a dropped enqueue — the limit is
// asymmetric, and it is the thing to know before relying on this boundary:
//
//  - **Create**: fully covered. The VOC has no row at the active version, so
//    `selectVocsMissingEmbedding` finds it on the next cron run.
//  - **Edit**: NOT covered. The VOC already has a row at the active version,
//    so the backfill query skips it and the stored vector stays stale — until
//    the next successful edit, or an EMBEDDING_VERSION bump. Nothing detects
//    this, because the staleness signal is `source_hash`, which is derived in
//    TypeScript and cannot be recomputed by the backfill's SQL.
//
// That is an accepted consequence of choosing the VOC over its index, not an
// oversight: a stale vector degrades recommendation ranking, while a
// transactional enqueue would lose user-authored content. Closing it needs a
// DB-visible staleness signal (#168 step 4+), not a change to this boundary.

import type { PgBoss } from 'pg-boss';

import { VOC_EMBED_QUEUE, type VocEmbedPayload } from '../jobs/embed-voc.js';

/**
 * Delay before a worker may claim the job. The enqueue happens inside the
 * writing transaction; this pushes the earliest pickup past its commit, so the
 * worker sees the VOC it was told about. Generous relative to a VOC write
 * (milliseconds) and irrelevant to a background index.
 */
export const VOC_EMBED_START_AFTER_SECONDS = 5;

export interface VocEmbeddingEnqueuer {
  enqueue(args: {
    workspaceId: string;
    vocId: string;
    correlationId: string;
  }): Promise<void>;
}

export interface VocEmbeddingEnqueuerDeps {
  /** Absent in tests and in any process booted without pg-boss. */
  boss?: PgBoss;
  /** False when EMBEDDING_PROVIDER=disabled — ADR-0034 D2: enqueue nothing. */
  embeddingEnabled: boolean;
  startAfterSeconds?: number;
  log?: { error: (msg: string, meta?: unknown) => void };
}

export function createVocEmbeddingEnqueuer(
  deps: VocEmbeddingEnqueuerDeps,
): VocEmbeddingEnqueuer {
  return {
    async enqueue(args): Promise<void> {
      if (!deps.embeddingEnabled) return;
      const boss = deps.boss;
      if (!boss) return;

      const payload: VocEmbedPayload = {
        workspace_id: args.workspaceId,
        voc_id: args.vocId,
        correlation_id: args.correlationId,
      };
      try {
        await boss.send(VOC_EMBED_QUEUE, payload, {
          startAfter: deps.startAfterSeconds ?? VOC_EMBED_START_AFTER_SECONDS,
        });
      } catch (err) {
        // Swallowed on purpose. See the file header: the VOC is already
        // written (or about to commit) and the cron backfill will find it.
        deps.log?.error('voc.embed_voc enqueue failed; leaving it to the cron backfill', {
          voc_id: args.vocId,
          workspace_id: args.workspaceId,
          correlation_id: args.correlationId,
          err,
        });
      }
    },
  };
}

/** No-op enqueuer for callers that construct the VOC service without pg-boss. */
export function createNoopVocEmbeddingEnqueuer(): VocEmbeddingEnqueuer {
  return {
    async enqueue(): Promise<void> {
      /* nothing to enqueue */
    },
  };
}
