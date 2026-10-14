import { type SQL, sql } from 'drizzle-orm';
import { sqlUuidArray } from '../../../db/sql-arrays.js';
import type { Tx } from '../../../db/tx.js';
import { managedSystemIsLiveSql } from '../../managed-systems/read-projections.js';
import {
  type ActorContextLite,
  type Scope,
  similarVocVisibilityPredicate,
} from '../authorization.js';
import type { EmbeddingProvider } from '../embedding/port.js';
import { deriveVocEmbeddingInput } from '../embedding/text.js';

export const VOC_CLUSTER_SUGGESTION_CUT = 0.85;
export const SUGGESTION_PAGE_SIZE = 100;
export const SUGGESTION_READ_SCAN_CEILING = 10_000;
export const SUGGESTION_PENDING_CAP = 20;
export const SUGGESTION_HOURLY_CAP = 5;

export interface SuggestionRow extends Record<string, unknown> {
  id: string;
  workspace_id: string;
  primary_managed_system_id: string;
  voc_a_id: string;
  voc_b_id: string;
  state: 'pending' | 'discarded' | 'confirmed';
  revision: number;
  provider: string;
  model: string;
  dimensions: number;
  embedding_version: number;
  source_hash_a: string;
  source_hash_b: string;
  embedding_watermark_a: Date;
  embedding_watermark_b: Date;
  score: number;
  cut: number;
  discarded_by_actor_id: string | null;
  discarded_at: Date | null;
  voc_cluster_id: string | null;
}
export interface PairVoc extends Record<string, unknown> {
  id: string;
  workspace_id: string;
  primary_managed_system_id: string;
  reporter_id: string;
  title: string;
  display_id: string;
  description_rich_content: Record<string, unknown> | null;
  archived_at: Date | null;
  updated_at: Date;
}
export interface EmbeddingRow extends Record<string, unknown> {
  voc_id: string;
  provider: string;
  model: string;
  dimensions: number;
  embedding_version: number;
  source_hash: string;
  actual_dimensions: number;
  updated_at: Date;
}

export async function lockSuggestions(tx: Tx, ws: string): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`voc-cluster-suggestions:${ws}`}, 0))`,
  );
}
export async function suggestionById(tx: Tx, ws: string, id: string, lock = false) {
  const result = await tx.execute<SuggestionRow>(sql`SELECT * FROM voc.voc_cluster_suggestions
    WHERE workspace_id = ${ws} AND id = ${id} ${lock ? sql`FOR UPDATE` : sql``}`);
  return result.rows[0];
}
export async function pairVocs(
  tx: Tx,
  row: Pick<SuggestionRow, 'workspace_id' | 'voc_a_id' | 'voc_b_id'>,
  lock = false,
) {
  const result = await tx.execute<PairVoc>(sql`SELECT * FROM voc.vocs
    WHERE workspace_id = ${row.workspace_id} AND id IN (${row.voc_a_id}, ${row.voc_b_id})
    ORDER BY id ${lock ? sql`FOR SHARE` : sql``}`);
  return result.rows;
}

/** SQL half of C6; derived text is checked in TS below, including generation. */
export function livePairPredicate(s: SQL, version: number): SQL {
  return sql`${s}.embedding_version = ${version} AND ${s}.cut = ${VOC_CLUSTER_SUGGESTION_CUT}
    AND ${s}.score >= ${s}.cut
    AND ${managedSystemIsLiveSql(sql`${s}.primary_managed_system_id`)}
    AND NOT EXISTS (SELECT 1 FROM voc_cluster.voc_cluster_members m
      JOIN voc_cluster.voc_clusters c ON c.id = m.cluster_id
      WHERE c.workspace_id = ${s}.workspace_id AND c.primary_managed_system_id = ${s}.primary_managed_system_id
        AND m.voc_id IN (${s}.voc_a_id, ${s}.voc_b_id))
    AND NOT EXISTS (SELECT 1 FROM voc.voc_recommendation_decisions d
      WHERE d.workspace_id = ${s}.workspace_id AND d.embedding_version = ${version} AND d.state = 'dismissed'
        AND ((d.source_voc_id = ${s}.voc_a_id AND d.candidate_voc_id = ${s}.voc_b_id)
          OR (d.source_voc_id = ${s}.voc_b_id AND d.candidate_voc_id = ${s}.voc_a_id)))`;
}

export async function eligiblePair(
  tx: Tx,
  row: SuggestionRow,
  version: number,
  identity: ReturnType<EmbeddingProvider['identity']>,
  vocs?: PairVoc[],
): Promise<boolean> {
  if (
    row.embedding_version !== version ||
    row.provider !== identity.provider ||
    row.model !== identity.model ||
    row.dimensions !== identity.dimensions ||
    row.cut !== VOC_CLUSTER_SUGGESTION_CUT ||
    row.score < row.cut
  )
    return false;
  const current = vocs ?? (await pairVocs(tx, row));
  if (current.length !== 2) return false;
  const valid = await tx.execute(sql`SELECT 1 FROM voc.voc_cluster_suggestions s
    WHERE s.id = ${row.id} AND ${livePairPredicate(sql`s`, version)}`);
  if (valid.rows.length === 0) return false;
  // Compare watermarks in SQL, preserving PostgreSQL microseconds that JS Dates lose.
  const embeds =
    await tx.execute<EmbeddingRow>(sql`SELECT e.voc_id, e.provider, e.model, e.dimensions,
    e.embedding_version, e.source_hash, vector_dims(e.embedding) AS actual_dimensions, e.updated_at
    FROM voc.voc_embeddings e JOIN voc.vocs v ON v.id=e.voc_id AND v.workspace_id=e.workspace_id
    JOIN voc.voc_cluster_suggestions s ON s.id=${row.id} AND s.workspace_id=e.workspace_id
    JOIN voc.voc_embeddings other ON other.workspace_id=e.workspace_id AND other.embedding_version=e.embedding_version
      AND other.voc_id=CASE WHEN e.voc_id=s.voc_a_id THEN s.voc_b_id ELSE s.voc_a_id END
    WHERE e.workspace_id = ${row.workspace_id} AND e.embedding_version = ${version}
      AND e.voc_id IN (${row.voc_a_id}, ${row.voc_b_id}) AND e.updated_at>=v.updated_at
      AND e.updated_at=CASE WHEN e.voc_id=s.voc_a_id THEN s.embedding_watermark_a ELSE s.embedding_watermark_b END
      AND CASE WHEN vector_dims(e.embedding)=vector_dims(other.embedding)
        THEN (1-(e.embedding <=> other.embedding)) BETWEEN s.cut AND 1 ELSE false END
    ORDER BY e.voc_id`);
  return current.every((v, i) => {
    const e = embeds.rows[i];
    const hash = i === 0 ? row.source_hash_a : row.source_hash_b;
    return (
      v.id === (i === 0 ? row.voc_a_id : row.voc_b_id) &&
      v.workspace_id === row.workspace_id &&
      v.primary_managed_system_id === row.primary_managed_system_id &&
      !v.archived_at &&
      !!e &&
      e.voc_id === v.id &&
      e.provider === row.provider &&
      e.model === row.model &&
      e.dimensions === row.dimensions &&
      e.actual_dimensions === row.dimensions &&
      e.source_hash === hash &&
      deriveVocEmbeddingInput({
        title: v.title,
        descriptionRichContent: v.description_rich_content,
      }).sourceHash === hash
    );
  });
}

export interface PagePosition {
  id: string;
  score: number;
  voc_a_id: string;
  voc_b_id: string;
}
export async function pendingPage(
  tx: Tx,
  ws: string,
  after?: PagePosition,
  ms?: string,
  pageSize = SUGGESTION_PAGE_SIZE,
  visibility?: { actor: ActorContextLite; findingScope: Scope; readScope: Scope },
) {
  const finding =
    !visibility || visibility.findingScope.kind === 'all'
      ? sql`true`
      : sql`s.primary_managed_system_id = ANY(${sqlUuidArray(visibility.findingScope.managedSystemIds)})`;
  const result = await tx.execute<SuggestionRow>(sql`SELECT s.* FROM voc.voc_cluster_suggestions s
    WHERE s.workspace_id = ${ws} AND s.state = 'pending'
      ${ms ? sql`AND s.primary_managed_system_id = ${ms}` : sql``}
      AND ${finding}
      ${
        visibility
          ? sql`AND EXISTS (SELECT 1 FROM voc.vocs a
        WHERE a.workspace_id=s.workspace_id AND a.id=s.voc_a_id
          AND ${similarVocVisibilityPredicate(visibility.readScope, visibility.actor.actor_id, sql`a`)})
        AND EXISTS (SELECT 1 FROM voc.vocs b
        WHERE b.workspace_id=s.workspace_id AND b.id=s.voc_b_id
          AND ${similarVocVisibilityPredicate(visibility.readScope, visibility.actor.actor_id, sql`b`)})`
          : sql``
      }
      ${
        after
          ? sql`AND (s.score < ${after.score} OR (s.score = ${after.score}
        AND (s.voc_a_id, s.voc_b_id, s.id) > (${after.voc_a_id}::uuid, ${after.voc_b_id}::uuid, ${after.id}::uuid)))`
          : sql``
      }
    ORDER BY s.score DESC, s.voc_a_id, s.voc_b_id, s.id LIMIT ${pageSize}`);
  return result.rows;
}
/** Occupancy is workspace-wide, with no actor scope or read scan ceiling. */
export async function eligiblePending(
  tx: Tx,
  ws: string,
  version: number,
  identity: ReturnType<EmbeddingProvider['identity']>,
  budget?: () => Promise<void>,
  pageSize = SUGGESTION_PAGE_SIZE,
): Promise<SuggestionRow[]> {
  const eligible: SuggestionRow[] = [];
  let after: PagePosition | undefined;
  for (;;) {
    const page = await pendingPage(tx, ws, after, undefined, pageSize);
    for (const row of page) {
      await budget?.();
      if (await eligiblePair(tx, row, version, identity)) eligible.push(row);
    }
    if (page.length < pageSize) break;
    after = page[page.length - 1];
  }
  return eligible;
}
export async function writeCounter(tx: Tx, ws: string, count: number) {
  await tx.execute(sql`INSERT INTO voc.voc_cluster_suggestion_counters (workspace_id, eligible_pending_count)
    VALUES (${ws}, ${count}) ON CONFLICT (workspace_id) DO UPDATE
    SET eligible_pending_count = EXCLUDED.eligible_pending_count, updated_at = now()`);
}
export { sqlUuidArray };
