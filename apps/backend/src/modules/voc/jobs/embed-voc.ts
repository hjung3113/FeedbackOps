// #168 step 3 — the per-VOC embedding job (ADR-0034 D6).
//
// One job = one VOC at the active embedding version. The handler is the only
// writer of voc.voc_embeddings; both the write path (enqueue-on-write) and the
// cron backfill reach the table through this queue, so there is exactly one
// place where the "is this content already embedded?" decision lives.

import { sql } from 'drizzle-orm';
import type { PgBoss } from 'pg-boss';

import type { Db } from '../../../db/client.js';
import { EmbeddingUnavailableError } from '../embedding/disabled.js';
import type { EmbeddingProvider } from '../embedding/port.js';
import {
  selectVocEmbeddingSourceHash,
  touchVocEmbeddingCheckedAt,
  upsertVocEmbedding,
} from '../embedding/repo.js';
import { deriveVocEmbeddingInput } from '../embedding/text.js';

/** Queue name. Format: `<module>.<action>` per ADR-0009. */
export const VOC_EMBED_QUEUE = 'voc.embed_voc';

export interface VocEmbedPayload {
  workspace_id: string;
  voc_id: string;
  correlation_id: string;
}

export interface VocEmbedLogger {
  info: (msg: string, meta?: unknown) => void;
  warn: (msg: string, meta?: unknown) => void;
}

export interface EmbedVocDeps {
  db: Db;
  provider: EmbeddingProvider;
  /** Active version from config (EMBEDDING_VERSION). Never inferred from a row. */
  embeddingVersion: number;
  /** False when EMBEDDING_PROVIDER=disabled — see `embedVoc` for the contract. */
  embeddingEnabled: boolean;
  log?: VocEmbedLogger;
}

/**
 * What the handler did. Returned (rather than logged only) so tests can assert
 * the branch taken without reading log output.
 */
export type EmbedVocOutcome =
  /** Provider is disabled for this environment: nothing written, not a failure. */
  | 'disabled'
  /** The VOC no longer exists (deleted, or the writing tx rolled back). */
  | 'voc_not_found'
  /** A row already exists at this version with the same source_hash. */
  | 'unchanged'
  /** A vector was written (inserted or updated in place). */
  | 'written';

/**
 * Embed one VOC at the active version.
 *
 * Disabled-provider contract: returns `'disabled'` **without throwing**. A
 * missing provider is a configuration state, not a transient fault — throwing
 * would burn the queue's five retries and then dead-letter every VOC in the
 * workspace on a config the operator chose. Normal ingestion never reaches
 * this branch (the enqueue path is gated on the same flag); it exists for the
 * window where a job was enqueued and the provider was disabled before the
 * worker picked it up.
 *
 * Missing-VOC contract: also returns without throwing. Enqueue-on-write fires
 * before its transaction commits, so a rolled-back create can leave a job
 * pointing at a VOC that never existed; retrying that forever is pure noise.
 * If the VOC does exist and was merely raced, the cron backfill re-enqueues it.
 *
 * Real faults (provider HTTP errors, database errors) still propagate, so
 * pg-boss retry/backoff applies to the cases retrying can actually fix.
 */
export async function embedVoc(
  deps: EmbedVocDeps,
  payload: VocEmbedPayload,
): Promise<EmbedVocOutcome> {
  if (!deps.embeddingEnabled) {
    deps.log?.info('voc.embed_voc skipped: embedding provider disabled', {
      voc_id: payload.voc_id,
      correlation_id: payload.correlation_id,
    });
    return 'disabled';
  }

  const rows = await deps.db.execute<{
    id: string;
    workspace_id: string;
    title: string;
    description_rich_content: unknown;
    updated_at: string;
  }>(sql`
    select id, workspace_id, title, description_rich_content, updated_at
    from voc.vocs
    where id = ${payload.voc_id}
      and workspace_id = ${payload.workspace_id}
  `);
  const voc = rows.rows[0];
  if (!voc) {
    deps.log?.warn('voc.embed_voc skipped: VOC not found', {
      voc_id: payload.voc_id,
      workspace_id: payload.workspace_id,
      correlation_id: payload.correlation_id,
    });
    return 'voc_not_found';
  }

  const { text, sourceHash } = deriveVocEmbeddingInput({
    title: voc.title,
    descriptionRichContent: voc.description_rich_content,
  });

  const storedHash = await selectVocEmbeddingSourceHash(deps.db, {
    vocId: voc.id,
    embeddingVersion: deps.embeddingVersion,
  });
  if (storedHash === sourceHash) {
    // Record that the row was confirmed current. The backfill's staleness
    // signal is `voc_embeddings.updated_at < vocs.updated_at`, and any update
    // to a VOC bumps the latter — so without this touch, a VOC edited in a way
    // that did not change its embedded text would be re-selected on every cron
    // run forever. No provider call, no vector rewrite.
    //
    // Stamped with the `vocs.updated_at` read at the top of this handler, not
    // `now()`: if the VOC changed again while we were working, the watermark
    // stays behind the VOC and the row correctly remains a candidate.
    await touchVocEmbeddingCheckedAt(deps.db, {
      vocId: voc.id,
      embeddingVersion: deps.embeddingVersion,
      sourceUpdatedAt: voc.updated_at,
    });
    deps.log?.info('voc.embed_voc skipped: source_hash unchanged', {
      voc_id: voc.id,
      embedding_version: deps.embeddingVersion,
      correlation_id: payload.correlation_id,
    });
    return 'unchanged';
  }

  let result;
  try {
    result = await deps.provider.embed([text]);
  } catch (err) {
    // Defence in depth: `embeddingEnabled` should already have short-circuited,
    // but a hand-wired disabled provider must not become a retry loop either.
    if (err instanceof EmbeddingUnavailableError) {
      deps.log?.warn('voc.embed_voc skipped: provider reported unavailable', {
        voc_id: voc.id,
        correlation_id: payload.correlation_id,
      });
      return 'disabled';
    }
    throw err;
  }

  const vector = result.vectors[0];
  if (!vector) {
    throw new Error(`Embedding provider returned no vector for VOC ${voc.id}`);
  }

  await upsertVocEmbedding(deps.db, {
    vocId: voc.id,
    workspaceId: voc.workspace_id,
    embeddingVersion: deps.embeddingVersion,
    // Storage metadata comes from the result, never from config: a provider
    // that silently serves a different model must be visible in the data.
    provider: result.provider,
    model: result.model,
    dimensions: result.dimensions,
    embedding: vector,
    sourceHash,
    // The VOC revision this vector reflects — see `upsertVocEmbedding`. Taken
    // from the row read before the provider call, so a concurrent edit is not
    // masked by our own write.
    sourceUpdatedAt: voc.updated_at,
  });

  deps.log?.info('voc.embed_voc wrote embedding', {
    voc_id: voc.id,
    embedding_version: deps.embeddingVersion,
    provider: result.provider,
    model: result.model,
    correlation_id: payload.correlation_id,
  });
  return 'written';
}

/**
 * The `boss.work` callback as a named factory, mirroring `__purgeHandler` in
 * core/jobs: unit-testable without booting pg-boss, and errors propagate so
 * ADR-0009 retry config takes effect.
 */
export function embedVocHandler(deps: EmbedVocDeps) {
  return async (jobs: Array<{ id: string; data: VocEmbedPayload }>) => {
    for (const job of jobs) {
      await embedVoc(deps, {
        ...job.data,
        correlation_id: job.data?.correlation_id ?? job.id,
      });
    }
  };
}

export async function registerEmbedVoc(boss: PgBoss, deps: EmbedVocDeps): Promise<void> {
  const queues = await boss.getQueues([VOC_EMBED_QUEUE]);
  if (queues.length === 0) {
    throw new Error(
      `pg-boss queue '${VOC_EMBED_QUEUE}' is not pre-created. Run migrations (ADR-0009).`,
    );
  }
  await boss.work<VocEmbedPayload>(VOC_EMBED_QUEUE, embedVocHandler(deps));
}
