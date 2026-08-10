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
  /**
   * The `voc.vocs.updated_at` the writer observed *before* deriving this
   * vector. Stored verbatim as this row's `updated_at`. See the header comment
   * on `updated_at` semantics below.
   */
  sourceUpdatedAt: string;
}

/**
 * Insert-or-update the row at (voc_id, embedding_version).
 *
 * ON CONFLICT rather than read-then-insert: the primary key
 * `voc_embeddings_voc_version_pk` is what makes two concurrent workers for the
 * same VOC safe. A read-then-insert would let both reads miss and one insert
 * fail with a duplicate-key error, turning an ordinary race into a retried job.
 *
 * `updated_at` is a **watermark, not a write time**: it holds the
 * `voc.vocs.updated_at` this row's vector reflects, copied from the row the
 * writer read before calling the provider — never `now()`.
 *
 * That distinction is the whole reason the staleness comparison in
 * `selectVocsNeedingEmbedding` is safe under concurrency. Embedding a VOC is
 * read → provider call (slow, seconds) → write, and the VOC can be edited in
 * between. Stamping `now()` would mark the row current as of *after* that
 * edit, permanently hiding a vector built from text the reporter has already
 * replaced — the exact failure the staleness signal exists to catch, reachable
 * whenever a cron backfill job overlaps the edit's own job. Stamping the
 * observed watermark instead leaves the row behind its VOC, so whichever
 * writer loses the race self-heals on the next run.
 *
 * Cost of the choice: nothing records when a vector was physically computed.
 * Nothing reads that today. If a later slice needs it, add an explicit column
 * rather than reverting this one to `now()`.
 */
export async function upsertVocEmbedding(tx: Tx, args: UpsertVocEmbeddingArgs): Promise<void> {
  // pgvector's text input format is `[a,b,c]`, which is exactly what
  // JSON.stringify produces for a number[]. Parameterised, so no injection
  // surface even though the value is rendered as text.
  const literal = JSON.stringify(args.embedding);
  await tx.execute(sql`
    insert into voc.voc_embeddings (
      voc_id, workspace_id, embedding_version, provider, model, dimensions, embedding,
      source_hash, updated_at
    ) values (
      ${args.vocId}, ${args.workspaceId}, ${args.embeddingVersion}, ${args.provider},
      ${args.model}, ${args.dimensions}, ${literal}::vector, ${args.sourceHash},
      ${args.sourceUpdatedAt}
    )
    on conflict on constraint voc_embeddings_voc_version_pk do update set
      workspace_id = excluded.workspace_id,
      provider = excluded.provider,
      model = excluded.model,
      dimensions = excluded.dimensions,
      embedding = excluded.embedding,
      source_hash = excluded.source_hash,
      updated_at = excluded.updated_at
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

/**
 * Marks a row as still current without rewriting its vector.
 *
 * Called when the handler finds the stored `source_hash` already matches. It
 * is what makes the timestamp staleness signal below *converge*: a VOC touched
 * by a write that did not change its embedded text (a triage edit, say) shows
 * up as a stale candidate exactly once, is checked cheaply, and then stops
 * being a candidate. Without this it would be re-selected on every cron run
 * forever, permanently occupying the batch.
 */
export async function touchVocEmbeddingCheckedAt(
  tx: Tx,
  args: { vocId: string; embeddingVersion: number; sourceUpdatedAt: string },
): Promise<void> {
  await tx.execute(sql`
    update voc.voc_embeddings
    set updated_at = ${args.sourceUpdatedAt}
    where voc_id = ${args.vocId}
      and embedding_version = ${args.embeddingVersion}
  `);
}

export interface VocNeedingEmbedding {
  voc_id: string;
  workspace_id: string;
}

// ── The staleness signal ─────────────────────────────────────────────────────
//
// A VOC needs (re-)embedding at the active version when either:
//
//   * it has no row at that version — never embedded, or the version was
//     bumped (ADR-0034 D2's model-swap path); or
//   * its row is older than the VOC itself: `e.updated_at < v.updated_at`.
//
// Why a timestamp and not the content hash: `source_hash` is derived in
// TypeScript from flattened rich content, so this SQL cannot recompute it.
// `voc.vocs.updated_at` is maintained by the unconditional `vocs_touch_
// updated_at_trg` BEFORE UPDATE trigger, so **every** update to a VOC row
// bumps it.
//
// That makes the signal *sound but not minimal*: it never misses a real
// title/description change (any such write is an UPDATE, so the trigger
// fires), but it also flags VOCs touched by writes that left the embedded text
// alone — a severity change, an owner reassignment. Those false candidates are
// cheap and self-clearing: the handler compares `source_hash`, skips the
// provider call entirely, and calls `touchVocEmbeddingCheckedAt`, so each one
// costs a single no-op job and then stops being selected.
//
// The alternative — a `content_updated_at` column bumped only by title/
// description writes — would be minimal, but needs a migration and a write-path
// change to stay correct, and buys only the elimination of no-op jobs. Not
// worth it until those jobs are measured to matter.
//
// Archived VOCs are excluded: they are not recommendation candidates, and
// embedding them would spend provider quota on rows no query will ever read.
// Un-archiving does not itself re-enqueue — but because un-archiving is an
// UPDATE, the trigger bumps `updated_at`, so an un-archived VOC that already
// had a row becomes a stale candidate on the next run. Only one that was never
// embedded at all stays uncovered until its next edit or a version bump.

/** VOCs missing or stale at the active version, longest-outstanding first. */
export async function selectVocsNeedingEmbedding(
  tx: Tx,
  args: { embeddingVersion: number; limit: number },
): Promise<VocNeedingEmbedding[]> {
  const result = await tx.execute<{ voc_id: string; workspace_id: string }>(sql`
    select v.id as voc_id, v.workspace_id
    from voc.vocs v
    left join voc.voc_embeddings e
      on e.voc_id = v.id
     and e.embedding_version = ${args.embeddingVersion}
    where v.archived_at is null
      and (e.voc_id is null or e.updated_at < v.updated_at)
    order by v.updated_at asc, v.id asc
    limit ${args.limit}
  `);
  return [...result.rows];
}

/** Total outstanding count, so a bounded batch can report what it left behind. */
export async function countVocsNeedingEmbedding(
  tx: Tx,
  args: { embeddingVersion: number },
): Promise<number> {
  const result = await tx.execute<{ outstanding: string }>(sql`
    select count(*)::text as outstanding
    from voc.vocs v
    left join voc.voc_embeddings e
      on e.voc_id = v.id
     and e.embedding_version = ${args.embeddingVersion}
    where v.archived_at is null
      and (e.voc_id is null or e.updated_at < v.updated_at)
  `);
  return Number(result.rows[0]?.outstanding ?? 0);
}
