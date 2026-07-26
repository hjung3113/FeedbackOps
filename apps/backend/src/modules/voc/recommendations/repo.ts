// Storage + read model for embedding recommendations (#168 step 4).
//
// Two responsibilities, deliberately in one file because they share the
// suppression key: the similarity read model (ADR-0034 D5/D6, computed on
// read) and the durable decision table (ADR-0034 D3).

import { sql } from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import type { Tx } from '../../../db/tx.js';
import type { Scope } from '../repo-read.js';

import { candidateVisibilityPredicate, dismissalScopeKeySql } from './scope.js';

export interface VocRecommendationRow {
  voc_id: string;
  display_id: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical' | null;
  reporter_facing_status: string;
  primary_managed_system_id: string;
  score: number;
}

export interface VocRecommendationPage {
  items: VocRecommendationRow[];
  /**
   * Authorized candidates above the threshold, *before* the cap. Produced by
   * the same query as `items` (a window aggregate over the filtered set), so
   * it cannot drift from what the actor is allowed to see. See the note on
   * `selectVocRecommendations`.
   */
  total: number;
}

export interface RecommendationVocRow {
  id: string;
  workspace_id: string;
  primary_managed_system_id: string;
  reporter_id: string;
  title: string;
  archived_at: Date | null;
}

/**
 * The similarity read model.
 *
 * Authorization is a WHERE clause, not a post-filter, and that is the whole
 * design. ADR-0034 D4 requires that an unauthorized candidate must not appear,
 * must not be counted, and must not shift the "N more" number. Filtering in
 * SQL before `count(*) OVER ()` makes that structural: there is no point in
 * the pipeline at which a row the actor cannot read has been counted and is
 * waiting to be removed. A service-layer `.filter()` after a `LIMIT` would
 * silently violate all three at once — the cap would be spent on rows that are
 * then dropped, and the total would include them.
 *
 * Suppression (`voc_recommendation_decisions`) is applied in the same place
 * and for the same reason: a dismissed pair must not consume a cap slot.
 *
 * `<=>` is pgvector's cosine distance, so similarity is `1 - distance`.
 */
export async function selectVocRecommendations(
  db: Tx,
  args: {
    workspaceId: string;
    sourceVocId: string;
    actorId: string;
    readScope: Scope;
    embeddingVersion: number;
    threshold: number;
    limit: number;
  },
): Promise<VocRecommendationPage> {
  const { workspaceId, sourceVocId, actorId, readScope, embeddingVersion, threshold, limit } = args;
  const visible = candidateVisibilityPredicate(readScope, actorId, sql`c`);
  const scopeKey = dismissalScopeKeySql(readScope, actorId, sql`c.primary_managed_system_id`);

  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    WITH source AS (
      SELECT se.workspace_id, se.embedding, se.embedding_version
        FROM voc.voc_embeddings se
       WHERE se.voc_id = ${sourceVocId}
         AND se.workspace_id = ${workspaceId}
         AND se.embedding_version = ${embeddingVersion}
    ),
    candidates AS (
      SELECT c.id,
             c.display_id,
             c.title,
             c.severity,
             c.reporter_facing_status,
             c.primary_managed_system_id,
             (1 - (ce.embedding <=> source.embedding))::float8 AS score,
             ${scopeKey} AS scope_key
        FROM source
        JOIN voc.voc_embeddings ce
          ON ce.embedding_version = source.embedding_version
         AND ce.workspace_id = source.workspace_id
         AND ce.voc_id <> ${sourceVocId}
        JOIN voc.vocs c
          ON c.id = ce.voc_id
         AND c.workspace_id = ${workspaceId}
         AND c.archived_at IS NULL
       WHERE ${visible}
    ),
    eligible AS (
      SELECT *
        FROM candidates
       WHERE candidates.score >= ${threshold}
         AND NOT EXISTS (
           SELECT 1
             FROM voc.voc_recommendation_decisions d
            WHERE d.source_voc_id = ${sourceVocId}
              AND d.candidate_voc_id = candidates.id
              AND d.embedding_version = ${embeddingVersion}
              AND (d.state = 'confirmed' OR d.scope_key = candidates.scope_key)
         )
    )
    SELECT id, display_id, title, severity, reporter_facing_status,
           primary_managed_system_id, score,
           (count(*) OVER ())::int AS total
      FROM eligible
     ORDER BY score DESC, id
     LIMIT ${limit}
  `);

  const items = result.rows.map((row) => ({
    voc_id: row.id as string,
    display_id: row.display_id as string,
    title: row.title as string,
    severity: (row.severity as VocRecommendationRow['severity']) ?? null,
    reporter_facing_status: row.reporter_facing_status as string,
    primary_managed_system_id: row.primary_managed_system_id as string,
    score: Number(row.score),
  }));
  return { items, total: Number(result.rows[0]?.total ?? 0) };
}

/** True when the source VOC has a vector at the active version. */
export async function hasEmbeddingAtVersion(
  db: Tx,
  args: { vocId: string; embeddingVersion: number },
): Promise<boolean> {
  const result = await (db as Db).execute<{ present: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM voc.voc_embeddings
       WHERE voc_id = ${args.vocId}
         AND embedding_version = ${args.embeddingVersion}
    ) AS present
  `);
  return result.rows[0]?.present === true;
}

/** Loads both ends of a pair in one round trip. Missing ids are simply absent. */
export async function selectRecommendationVocs(
  db: Tx,
  args: { workspaceId: string; vocIds: string[] },
): Promise<Map<string, RecommendationVocRow>> {
  const out = new Map<string, RecommendationVocRow>();
  if (args.vocIds.length === 0) return out;
  const items = args.vocIds.map((id) => sql`${id}::uuid`);
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT id, workspace_id, primary_managed_system_id, reporter_id, title, archived_at
      FROM voc.vocs
     WHERE workspace_id = ${args.workspaceId}
       AND id = ANY(ARRAY[${sql.join(items, sql`, `)}]::uuid[])
  `);
  for (const row of result.rows) {
    out.set(row.id as string, {
      id: row.id as string,
      workspace_id: row.workspace_id as string,
      primary_managed_system_id: row.primary_managed_system_id as string,
      reporter_id: row.reporter_id as string,
      title: row.title as string,
      archived_at:
        row.archived_at === null || row.archived_at === undefined
          ? null
          : new Date(row.archived_at as string),
    });
  }
  return out;
}

/**
 * Records a dismissal.
 *
 * `DO NOTHING` rather than `DO UPDATE`: a repeat dismissal of an already
 * dismissed pair is a no-op, and re-dismissing must not overwrite a
 * `confirmed` row — that direction of the state machine (confirmed →
 * dismissed) does not exist in ADR-0034 D3.
 */
export async function insertRecommendationDismissal(
  tx: Tx,
  args: {
    workspaceId: string;
    sourceVocId: string;
    candidateVocId: string;
    embeddingVersion: number;
    scopeKey: string;
    actorId: string;
  },
): Promise<void> {
  await (tx as Db).execute(sql`
    INSERT INTO voc.voc_recommendation_decisions
      (workspace_id, source_voc_id, candidate_voc_id, embedding_version, state, scope_key, decided_by)
    VALUES
      (${args.workspaceId}, ${args.sourceVocId}, ${args.candidateVocId},
       ${args.embeddingVersion}, 'dismissed', ${args.scopeKey}, ${args.actorId})
    ON CONFLICT ON CONSTRAINT voc_recommendation_decisions_pair_scope_version_uq
    DO NOTHING
  `);
}

/**
 * Records a confirmation.
 *
 * `DO UPDATE` here, unlike dismissal: confirming a pair the same scope had
 * previously dismissed is the one legal transition out of a terminal state,
 * and it must replace the suppression rather than fail on the unique key.
 */
export async function upsertRecommendationConfirmation(
  tx: Tx,
  args: {
    workspaceId: string;
    sourceVocId: string;
    candidateVocId: string;
    embeddingVersion: number;
    scopeKey: string;
    clusterId: string;
    actorId: string;
  },
): Promise<void> {
  await (tx as Db).execute(sql`
    INSERT INTO voc.voc_recommendation_decisions
      (workspace_id, source_voc_id, candidate_voc_id, embedding_version, state, scope_key,
       cluster_id, decided_by)
    VALUES
      (${args.workspaceId}, ${args.sourceVocId}, ${args.candidateVocId},
       ${args.embeddingVersion}, 'confirmed', ${args.scopeKey}, ${args.clusterId}, ${args.actorId})
    ON CONFLICT ON CONSTRAINT voc_recommendation_decisions_pair_scope_version_uq
    DO UPDATE SET
      state = 'confirmed',
      cluster_id = excluded.cluster_id,
      decided_by = excluded.decided_by,
      decided_at = now()
  `);
}

/**
 * The draft/confirmed cluster the source VOC already belongs to in this
 * Managed System, if any — so a second confirmation joins rather than forking
 * a parallel cluster. Newest first; a VOC in more than one cluster is possible
 * through the manual cluster surface, and the newest is the one the actor most
 * plausibly means.
 */
export async function selectClusterIdForVoc(
  db: Tx,
  args: { workspaceId: string; vocId: string; managedSystemId: string },
): Promise<string | null> {
  const result = await (db as Db).execute<{ id: string }>(sql`
    SELECT cl.id
      FROM voc_cluster.voc_cluster_members m
      JOIN voc_cluster.voc_clusters cl ON cl.id = m.cluster_id
     WHERE m.voc_id = ${args.vocId}
       AND cl.workspace_id = ${args.workspaceId}
       AND cl.primary_managed_system_id = ${args.managedSystemId}
     ORDER BY cl.created_at DESC, cl.id DESC
     LIMIT 1
  `);
  return result.rows[0]?.id ?? null;
}
