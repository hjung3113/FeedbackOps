// Persistence for voc.voc_embeddings (#168 step 3, ADR-0034 D1/D2).
//
// This repo owns exactly one table. It never reads config: the active
// embedding version is always passed in by the caller, so a query can never
// accidentally mix versions.

import { sql } from 'drizzle-orm';

import type { Tx } from '../../../db/tx.js';

export interface UpsertVocEmbeddingArgs {
  vocId: string;
  workspaceId: string;
  embeddingVersion: number;
  provider: string;
  model: string;
  dimensions: number;
  /** Raw vector; length must equal `dimensions` (the provider port guarantees this). */
  embedding: number[];
  sourceHash: string;
}

/**
 * Insert-or-update the row at (voc_id, embedding_version).
 *
 * ON CONFLICT rather than read-then-insert: the primary key
 * `voc_embeddings_voc_version_pk` is what makes two concurrent workers for the
 * same VOC safe. A read-then-insert would let both reads miss and one insert
 * fail with a duplicate-key error, turning an ordinary race into a retried job.
 *
 * `updated_at` is bumped on every write so a re-embed under an unchanged
 * version is still observable in the data.
 */
export async function upsertVocEmbedding(tx: Tx, args: UpsertVocEmbeddingArgs): Promise<void> {
  // pgvector's text input format is `[a,b,c]`, which is exactly what
  // JSON.stringify produces for a number[]. Parameterised, so no injection
  // surface even though the value is rendered as text.
  const literal = JSON.stringify(args.embedding);
  await tx.execute(sql`
    insert into voc.voc_embeddings (
      voc_id, workspace_id, embedding_version, provider, model, dimensions, embedding, source_hash
    ) values (
      ${args.vocId}, ${args.workspaceId}, ${args.embeddingVersion}, ${args.provider},
      ${args.model}, ${args.dimensions}, ${literal}::vector, ${args.sourceHash}
    )
    on conflict on constraint voc_embeddings_voc_version_pk do update set
      workspace_id = excluded.workspace_id,
      provider = excluded.provider,
      model = excluded.model,
      dimensions = excluded.dimensions,
      embedding = excluded.embedding,
      source_hash = excluded.source_hash,
      updated_at = now()
  `);
}

/** `null` when no row exists at that version — the "never embedded" case. */
export async function selectVocEmbeddingSourceHash(
  tx: Tx,
  args: { vocId: string; embeddingVersion: number },
): Promise<string | null> {
  const result = await tx.execute<{ source_hash: string }>(sql`
    select source_hash
    from voc.voc_embeddings
    where voc_id = ${args.vocId}
      and embedding_version = ${args.embeddingVersion}
  `);
  return result.rows[0]?.source_hash ?? null;
}

export interface VocNeedingEmbedding {
  voc_id: string;
  workspace_id: string;
}

/**
 * VOCs with no row at the active version, oldest first.
 *
 * Archived VOCs are excluded: they are not recommendation candidates, and
 * embedding them would spend provider quota on rows no query will ever read.
 * Un-archiving does not re-enqueue — the next title/description edit or a
 * manual backfill covers it. Recorded here because it is the one case where
 * the backfill is not a complete safety net.
 *
 * Rows whose content changed but whose hash is stale are *not* returned: they
 * already have a row at the active version. Those are covered by
 * enqueue-on-write, which is the only path that knows the content changed.
 */
export async function selectVocsMissingEmbedding(
  tx: Tx,
  args: { embeddingVersion: number; limit: number },
): Promise<VocNeedingEmbedding[]> {
  const result = await tx.execute<{ voc_id: string; workspace_id: string }>(sql`
    select v.id as voc_id, v.workspace_id
    from voc.vocs v
    where v.archived_at is null
      and not exists (
        select 1 from voc.voc_embeddings e
        where e.voc_id = v.id
          and e.embedding_version = ${args.embeddingVersion}
      )
    order by v.created_at asc, v.id asc
    limit ${args.limit}
  `);
  return [...result.rows];
}

/** Total outstanding count, so a bounded batch can report what it left behind. */
export async function countVocsMissingEmbedding(
  tx: Tx,
  args: { embeddingVersion: number },
): Promise<number> {
  const result = await tx.execute<{ missing: string }>(sql`
    select count(*)::text as missing
    from voc.vocs v
    where v.archived_at is null
      and not exists (
        select 1 from voc.voc_embeddings e
        where e.voc_id = v.id
          and e.embedding_version = ${args.embeddingVersion}
      )
  `);
  return Number(result.rows[0]?.missing ?? 0);
}
