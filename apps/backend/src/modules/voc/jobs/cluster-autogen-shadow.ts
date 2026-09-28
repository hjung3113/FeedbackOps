// Issue #512 — pairwise shadow measurement for a possible VOC cluster origin.
// The persisted rows are measurement output only: this job never creates
// clusters, members, recommendation decisions, or audit events.

import { sql } from 'drizzle-orm';
import type { PgBoss } from 'pg-boss';

import type { Db } from '../../../db/client.js';
import { type JobLog, JOB_WORK_OPTIONS, withJobLogging } from '../../../lib/job-log.js';
import { VOC_RECOMMENDATION_SIMILARITY_THRESHOLD } from '../recommendations/constants.js';

/** Queue name. Format: `<module>.<action>` per ADR-0009. */
export const VOC_CLUSTER_AUTOGEN_SHADOW_QUEUE = 'voc.cluster_autogen_shadow';

/** Record a once-hourly measurement of eligible pairs. */
export const VOC_CLUSTER_AUTOGEN_SHADOW_CRON = '0 * * * *';

/**
 * Lowest score retained for measurement. This is not the D5 recommendation
 * cut: recommendations remain pinned at VOC_RECOMMENDATION_SIMILARITY_THRESHOLD.
 */
export const VOC_CLUSTER_AUTOGEN_SHADOW_MEASUREMENT_FLOOR = 0.6;

/** Bound persisted pairs for each workspace/Managed System in one run. */
export const VOC_CLUSTER_AUTOGEN_SHADOW_MAX_PAIRS_PER_MANAGED_SYSTEM_PER_RUN = 200;

/** Bound one pairwise scan so an oversized system cannot monopolize a worker. */
export const VOC_CLUSTER_AUTOGEN_SHADOW_STATEMENT_TIMEOUT_MS = 120_000;

export interface VocClusterAutogenShadowPayload {
  correlation_id: string;
}

export interface VocClusterAutogenShadowManagedSystemSummary {
  workspace_id: string;
  primary_managed_system_id: string;
  embedding_version: number;
  eligible_pairs: number;
  would_form_count: number;
  recorded: number;
  remaining: number;
}

export interface VocClusterAutogenShadowResult {
  skipped: boolean;
  timed_out: boolean;
  embedding_version: number;
  managed_systems: VocClusterAutogenShadowManagedSystemSummary[];
}

export interface VocClusterAutogenShadowDeps {
  /** The handler's query and writes use the application's fops_app role. */
  db: Db;
  embeddingVersion: number;
  embeddingEnabled: boolean;
  statementTimeoutMs?: number;
  log?: JobLog;
}

interface SummaryDbRow extends Record<string, unknown> {
  workspace_id: string;
  primary_managed_system_id: string;
  embedding_version: number | string;
  eligible_pairs: number | string;
  would_form_count: number | string;
  recorded: number | string;
  remaining: number | string;
}

function isStatementTimeoutError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '57014';
}

/**
 * Records active-version same-Managed-System pairs above the measurement
 * floor, with an atomic upsert so a retry updates one row per distinct pair.
 */
export async function runVocClusterAutogenShadow(
  deps: VocClusterAutogenShadowDeps,
  payload: VocClusterAutogenShadowPayload,
): Promise<VocClusterAutogenShadowResult> {
  if (!deps.embeddingEnabled) {
    const result: VocClusterAutogenShadowResult = {
      skipped: true,
      timed_out: false,
      embedding_version: deps.embeddingVersion,
      managed_systems: [],
    };
    deps.log?.info('voc.cluster_autogen_shadow complete', {
      event: 'voc.cluster_autogen_shadow.complete',
      correlation_id: payload.correlation_id,
      embedding_version: deps.embeddingVersion,
      skipped: true,
      timed_out: false,
      managed_systems: [],
    });
    return result;
  }

  const statementTimeoutMs =
    deps.statementTimeoutMs ?? VOC_CLUSTER_AUTOGEN_SHADOW_STATEMENT_TIMEOUT_MS;
  if (!Number.isSafeInteger(statementTimeoutMs) || statementTimeoutMs < 1) {
    throw new RangeError('statementTimeoutMs must be a positive safe integer');
  }

  let queryRows: SummaryDbRow[] = [];
  try {
    const queryResult = await deps.db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL statement_timeout = ${statementTimeoutMs}`));
      return tx.execute<SummaryDbRow>(sql`
    WITH scoped_systems AS (
      SELECT DISTINCT v.workspace_id, v.primary_managed_system_id
        FROM voc.vocs v
        JOIN core.managed_systems ms
          ON ms.id = v.primary_managed_system_id
         AND ms.workspace_id = v.workspace_id
        JOIN voc.voc_embeddings e
          ON e.voc_id = v.id
         AND e.workspace_id = v.workspace_id
         AND e.embedding_version = ${deps.embeddingVersion}
       WHERE v.archived_at IS NULL
    ),
    pair_scores AS (
      SELECT low_voc.workspace_id,
             low_voc.primary_managed_system_id,
             low_voc.id AS voc_id_low,
             high_voc.id AS voc_id_high,
             low_embedding.embedding_version,
             (1 - (low_embedding.embedding <=> high_embedding.embedding))::float8 AS score
        FROM voc.voc_embeddings low_embedding
        JOIN voc.vocs low_voc
          ON low_voc.id = low_embedding.voc_id
         AND low_voc.workspace_id = low_embedding.workspace_id
         AND low_voc.archived_at IS NULL
        JOIN core.managed_systems ms
          ON ms.id = low_voc.primary_managed_system_id
         AND ms.workspace_id = low_voc.workspace_id
        JOIN voc.voc_embeddings high_embedding
          ON high_embedding.workspace_id = low_embedding.workspace_id
         AND high_embedding.embedding_version = low_embedding.embedding_version
         AND high_embedding.voc_id > low_embedding.voc_id
        JOIN voc.vocs high_voc
          ON high_voc.id = high_embedding.voc_id
         AND high_voc.workspace_id = high_embedding.workspace_id
         AND high_voc.archived_at IS NULL
         AND high_voc.primary_managed_system_id = low_voc.primary_managed_system_id
       WHERE low_embedding.embedding_version = ${deps.embeddingVersion}
    ),
    eligible AS (
      SELECT pair_scores.*
        FROM pair_scores
       WHERE pair_scores.score >= ${VOC_CLUSTER_AUTOGEN_SHADOW_MEASUREMENT_FLOOR}
         AND NOT EXISTS (
           SELECT 1
             FROM voc_cluster.voc_cluster_members member
             JOIN voc_cluster.voc_clusters cluster ON cluster.id = member.cluster_id
            WHERE cluster.workspace_id = pair_scores.workspace_id
              AND cluster.primary_managed_system_id = pair_scores.primary_managed_system_id
              AND member.voc_id IN (pair_scores.voc_id_low, pair_scores.voc_id_high)
         )
         AND NOT EXISTS (
           SELECT 1
             FROM voc.voc_recommendation_decisions decision
            WHERE decision.workspace_id = pair_scores.workspace_id
              AND decision.embedding_version = pair_scores.embedding_version
              AND decision.state = 'dismissed'
              AND (
                (decision.source_voc_id = pair_scores.voc_id_low
                 AND decision.candidate_voc_id = pair_scores.voc_id_high)
                OR
                (decision.source_voc_id = pair_scores.voc_id_high
                 AND decision.candidate_voc_id = pair_scores.voc_id_low)
              )
         )
    ),
    ranked AS (
      SELECT eligible.*,
             row_number() OVER (
               PARTITION BY eligible.workspace_id, eligible.primary_managed_system_id
               ORDER BY eligible.score DESC, eligible.voc_id_low, eligible.voc_id_high
             ) AS run_position
        FROM eligible
    ),
    bounded AS (
      SELECT *
        FROM ranked
       WHERE run_position <= ${VOC_CLUSTER_AUTOGEN_SHADOW_MAX_PAIRS_PER_MANAGED_SYSTEM_PER_RUN}
    ),
    upserted AS (
      INSERT INTO voc.voc_cluster_autogen_shadow_candidates (
        workspace_id,
        primary_managed_system_id,
        voc_id_low,
        voc_id_high,
        embedding_version,
        score,
        would_form,
        last_run_id,
        seen_count
      )
      SELECT bounded.workspace_id,
             bounded.primary_managed_system_id,
             bounded.voc_id_low,
             bounded.voc_id_high,
             bounded.embedding_version,
             bounded.score,
             bounded.score >= ${VOC_RECOMMENDATION_SIMILARITY_THRESHOLD},
             ${payload.correlation_id},
             1
        FROM bounded
      ON CONFLICT (workspace_id, voc_id_low, voc_id_high, embedding_version)
      DO UPDATE SET
        last_seen_at = now(),
        score = excluded.score,
        would_form = excluded.would_form,
        last_run_id = excluded.last_run_id,
        seen_count = CASE
          WHEN voc_cluster_autogen_shadow_candidates.last_run_id = excluded.last_run_id
            THEN voc_cluster_autogen_shadow_candidates.seen_count
          ELSE voc_cluster_autogen_shadow_candidates.seen_count + 1
        END
      RETURNING workspace_id, primary_managed_system_id
    ),
    eligible_counts AS (
      SELECT workspace_id,
             primary_managed_system_id,
             count(*)::int AS eligible_pairs,
             count(*) FILTER (
               WHERE score >= ${VOC_RECOMMENDATION_SIMILARITY_THRESHOLD}
             )::int AS would_form_count
        FROM eligible
       GROUP BY workspace_id, primary_managed_system_id
    ),
    recorded_counts AS (
      SELECT workspace_id, primary_managed_system_id, count(*)::int AS recorded
        FROM upserted
       GROUP BY workspace_id, primary_managed_system_id
    )
    SELECT scoped_systems.workspace_id,
           scoped_systems.primary_managed_system_id,
           ${deps.embeddingVersion}::int AS embedding_version,
           coalesce(eligible_counts.eligible_pairs, 0)::int AS eligible_pairs,
           coalesce(eligible_counts.would_form_count, 0)::int AS would_form_count,
           coalesce(recorded_counts.recorded, 0)::int AS recorded,
           (
             coalesce(eligible_counts.eligible_pairs, 0)
             - coalesce(recorded_counts.recorded, 0)
           )::int AS remaining
      FROM scoped_systems
      LEFT JOIN eligible_counts
        ON eligible_counts.workspace_id = scoped_systems.workspace_id
       AND eligible_counts.primary_managed_system_id = scoped_systems.primary_managed_system_id
      LEFT JOIN recorded_counts
        ON recorded_counts.workspace_id = scoped_systems.workspace_id
       AND recorded_counts.primary_managed_system_id = scoped_systems.primary_managed_system_id
     ORDER BY scoped_systems.workspace_id, scoped_systems.primary_managed_system_id
      `);
    });
    queryRows = queryResult.rows;
  } catch (error) {
    if (!isStatementTimeoutError(error)) throw error;

    const summary: VocClusterAutogenShadowResult = {
      skipped: false,
      timed_out: true,
      embedding_version: deps.embeddingVersion,
      managed_systems: [],
    };
    deps.log?.warn('voc.cluster_autogen_shadow timed out', {
      event: 'voc.cluster_autogen_shadow.timeout',
      correlation_id: payload.correlation_id,
      embedding_version: deps.embeddingVersion,
      statement_timeout_ms: statementTimeoutMs,
      timed_out: true,
    });
    return summary;
  }

  const managedSystems = queryRows.map((row) => ({
    workspace_id: row.workspace_id,
    primary_managed_system_id: row.primary_managed_system_id,
    embedding_version: Number(row.embedding_version),
    eligible_pairs: Number(row.eligible_pairs),
    would_form_count: Number(row.would_form_count),
    recorded: Number(row.recorded),
    remaining: Number(row.remaining),
  }));
  const summary: VocClusterAutogenShadowResult = {
    skipped: false,
    timed_out: false,
    embedding_version: deps.embeddingVersion,
    managed_systems: managedSystems,
  };

  const workspaces = new Map<string, Array<Omit<VocClusterAutogenShadowManagedSystemSummary, 'workspace_id'>>>();
  for (const row of managedSystems) {
    const { workspace_id, ...managedSystem } = row;
    const rows = workspaces.get(workspace_id) ?? [];
    rows.push(managedSystem);
    workspaces.set(workspace_id, rows);
  }
  deps.log?.info('voc.cluster_autogen_shadow complete', {
    event: 'voc.cluster_autogen_shadow.complete',
    correlation_id: payload.correlation_id,
    embedding_version: deps.embeddingVersion,
    skipped: false,
    timed_out: false,
    workspaces: Array.from(workspaces, ([workspace_id, systems]) => ({
      workspace_id,
      managed_systems: systems,
    })),
  });
  return summary;
}

export function vocClusterAutogenShadowHandler(deps: VocClusterAutogenShadowDeps) {
  return async (jobs: Array<{ id: string; data: VocClusterAutogenShadowPayload }>) => {
    for (const job of jobs) {
      // The recurring schedule stores a stable marker; use each pg-boss job id
      // as the run id so the persisted correlation is unique per execution.
      const correlationId =
        job.data?.correlation_id && job.data.correlation_id !== 'cron'
          ? job.data.correlation_id
          : job.id;
      await runVocClusterAutogenShadow(deps, { correlation_id: correlationId });
    }
  };
}

export async function registerVocClusterAutogenShadow(
  boss: PgBoss,
  deps: Omit<VocClusterAutogenShadowDeps, 'log'> & { log: JobLog },
): Promise<void> {
  const queues = await boss.getQueues([VOC_CLUSTER_AUTOGEN_SHADOW_QUEUE]);
  if (queues.length === 0) {
    throw new Error(
      `pg-boss queue '${VOC_CLUSTER_AUTOGEN_SHADOW_QUEUE}' is not pre-created. Run migrations (ADR-0009).`,
    );
  }
  await boss.work<VocClusterAutogenShadowPayload>(
    VOC_CLUSTER_AUTOGEN_SHADOW_QUEUE,
    JOB_WORK_OPTIONS,
    withJobLogging(
      deps.log,
      VOC_CLUSTER_AUTOGEN_SHADOW_QUEUE,
      vocClusterAutogenShadowHandler(deps),
    ),
  );
  await boss.schedule(VOC_CLUSTER_AUTOGEN_SHADOW_QUEUE, VOC_CLUSTER_AUTOGEN_SHADOW_CRON, {
    correlation_id: 'cron',
  });
}
