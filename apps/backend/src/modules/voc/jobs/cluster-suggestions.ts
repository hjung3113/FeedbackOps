import { sql } from 'drizzle-orm';
import type { PgBoss } from 'pg-boss';
import type { Db } from '../../../db/client.js';
import { lockRecoveryCommand } from '../../../db/recovery-command-lock.js';
import type { Tx } from '../../../db/tx.js';
import { JOB_WORK_OPTIONS, type JobLog, withJobLogging } from '../../../lib/job-log.js';
import {
  allManagedSystemWorkspacePairs,
  lockLiveManagedSystemForShare,
} from '../../managed-systems/read-projections.js';
import {
  getResolvedWorkspaceSettings,
  getResolvedWorkspaceSettingsForUpdate,
} from '../../workspace-settings/index.js';
import {
  type PairVoc,
  SUGGESTION_HOURLY_CAP,
  SUGGESTION_PENDING_CAP,
  VOC_CLUSTER_SUGGESTION_CUT,
  eligiblePending,
  lockSuggestions,
  sqlUuidArray,
  writeCounter,
} from '../cluster-suggestions/repo.js';
import type { EmbeddingProvider } from '../embedding/port.js';
import { deriveVocEmbeddingInput } from '../embedding/text.js';

export const VOC_CLUSTER_SUGGESTIONS_QUEUE = 'voc.cluster_suggestions';
export const VOC_CLUSTER_SUGGESTIONS_CRON = '0 * * * *';
export const VOC_CLUSTER_SUGGESTIONS_STATEMENT_TIMEOUT_MS = 30_000;
const SOURCE_PAGE = 200;
const NEIGHBOURS = 10;
const NEIGHBOUR_PAGES = 10;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
interface Deps {
  db: Db;
  embeddingVersion: number;
  embeddingEnabled: boolean;
  embeddingIdentity: ReturnType<EmbeddingProvider['identity']>;
  suggestionPageSize?: number;
  statementTimeoutMs?: number;
  log?: JobLog;
}
interface Payload {
  correlation_id: string;
  workspace_id?: string;
}
interface Source extends Record<string, unknown> {
  voc_id: string;
  watermark: string;
}
interface Candidate extends Record<string, unknown> {
  a: string;
  b: string;
  other: string;
  distance: number;
  score: number;
  provider: string;
  model: string;
  dimensions: number;
  hash_a: string;
  hash_b: string;
  watermark_a: string;
  watermark_b: string;
}
interface Cursor extends Record<string, unknown> {
  embedding_version: number;
  watermark: string;
  last_voc_id: string;
  reconciliation_after_voc_id: string | null;
  reconciled_at: Date | null;
}

async function generate(deps: Deps, payload: Payload, ws: string, ms: string) {
  return deps.db.transaction(async (tx) => {
    // A rollback (including timeout) rolls back cursor, counters and admissions.
    // 200 incremental + 200 reconciliation sources, <=100 neighbours/source,
    // <=4,000 retained pairs. Whole-workspace occupancy is paged without truncation.
    const deadline =
      Date.now() + (deps.statementTimeoutMs ?? VOC_CLUSTER_SUGGESTIONS_STATEMENT_TIMEOUT_MS);
    async function budget() {
      const remaining = deadline - Date.now();
      if (remaining <= 0)
        throw Object.assign(new Error('Suggestion transaction timed out'), { code: '57014' });
      await tx.execute(sql`SELECT set_config('statement_timeout', ${String(remaining)}, true),
        set_config('lock_timeout', ${String(Math.min(remaining, 5000))}, true)`);
    }
    await budget();
    await lockRecoveryCommand(tx, ws);
    await lockSuggestions(tx, ws);
    const settings = await getResolvedWorkspaceSettingsForUpdate(tx, ws);
    if (!settings.voc_cluster_suggestions_enabled) return { admitted: 0, refreshed: 0, scanned: 0 };
    if (!(await lockLiveManagedSystemForShare(tx, ws, ms)))
      return { admitted: 0, refreshed: 0, scanned: 0 };
    await budget();
    const pending = await eligiblePending(
      tx,
      ws,
      deps.embeddingVersion,
      deps.embeddingIdentity,
      budget,
      deps.suggestionPageSize,
    );
    let occupancy = pending.length;
    const cursorResult =
      await tx.execute<Cursor>(sql`SELECT *, embedding_watermark::text AS watermark
      FROM voc.voc_cluster_suggestion_cursors WHERE workspace_id = ${ws} AND primary_managed_system_id = ${ms}`);
    const previous = cursorResult.rows[0];
    // Initial/version-reset position precedes every real embedding; reset both scans.
    const cursor = previous?.embedding_version === deps.embeddingVersion ? previous : undefined;
    const incremental =
      await tx.execute<Source>(sql`SELECT e.voc_id, e.updated_at::text AS watermark
      FROM voc.voc_embeddings e JOIN voc.vocs v ON v.id=e.voc_id AND v.workspace_id=e.workspace_id
      WHERE e.workspace_id=${ws} AND e.embedding_version=${deps.embeddingVersion} AND v.primary_managed_system_id=${ms}
        AND (e.updated_at,e.voc_id) > (${cursor?.watermark ?? '0001-01-01T00:00:00Z'}::timestamptz,${cursor?.last_voc_id ?? ZERO_UUID}::uuid)
      ORDER BY e.updated_at,e.voc_id LIMIT ${SOURCE_PAGE}`);
    const reconciliation =
      await tx.execute<Source>(sql`SELECT e.voc_id,e.updated_at::text AS watermark
      FROM voc.voc_embeddings e JOIN voc.vocs v ON v.id=e.voc_id AND v.workspace_id=e.workspace_id
      WHERE e.workspace_id=${ws} AND e.embedding_version=${deps.embeddingVersion} AND v.primary_managed_system_id=${ms}
        AND e.voc_id > ${cursor?.reconciliation_after_voc_id ?? ZERO_UUID}::uuid
      ORDER BY e.voc_id LIMIT ${SOURCE_PAGE}`);
    // Empty incremental pages retain position. Reconciliation wraps after a short/empty
    // page, stamping completion; late inserts with old watermarks are recovered here.
    const sources = [
      ...new Set([...incremental.rows, ...reconciliation.rows].map((r) => r.voc_id)),
    ];
    const candidates = new Map<string, Candidate>();
    for (const source of sources) {
      await budget();
      // The exact existing pending pair is allowed to refresh; other eligible pairs veto.
      const occupied = pending
        .filter((p) => p.voc_a_id !== source && p.voc_b_id !== source)
        .flatMap((p) => [p.voc_a_id, p.voc_b_id]);
      const own = pending.find((p) => p.voc_a_id === source || p.voc_b_id === source);
      const ownOther = own ? (own.voc_a_id === source ? own.voc_b_id : own.voc_a_id) : undefined;
      let after: { distance: number; id: string } | undefined;
      let found = 0;
      for (let page = 0; page < NEIGHBOUR_PAGES && found < NEIGHBOURS; page++) {
        await budget();
        const neighbours = await tx.execute<Candidate>(sql`WITH source AS MATERIALIZED (
          SELECT e.*,v.primary_managed_system_id FROM voc.voc_embeddings e JOIN voc.vocs v
            ON v.id=e.voc_id AND v.workspace_id=e.workspace_id
          WHERE e.voc_id=${source} AND e.workspace_id=${ws} AND e.embedding_version=${deps.embeddingVersion}
            AND v.primary_managed_system_id=${ms} AND v.archived_at IS NULL AND e.updated_at>=v.updated_at
            AND e.provider=${deps.embeddingIdentity.provider} AND e.model=${deps.embeddingIdentity.model}
            AND e.dimensions=${deps.embeddingIdentity.dimensions}
        ), compatible AS MATERIALIZED (
          SELECT e.*,v.primary_managed_system_id FROM voc.voc_embeddings e JOIN voc.vocs v
            ON v.id=e.voc_id AND v.workspace_id=e.workspace_id
          JOIN source s ON e.provider=s.provider AND e.model=s.model AND e.dimensions=s.dimensions
          WHERE e.workspace_id=${ws} AND e.embedding_version=${deps.embeddingVersion} AND e.voc_id<>${source}
            AND v.primary_managed_system_id=${ms} AND v.archived_at IS NULL AND e.updated_at>=v.updated_at
            AND vector_dims(e.embedding)=e.dimensions AND vector_dims(s.embedding)=s.dimensions
            AND NOT (e.voc_id = ANY(${sqlUuidArray(occupied)}))
            ${ownOther ? sql`AND e.voc_id=${ownOther}` : sql``}
            AND NOT EXISTS (SELECT 1 FROM voc_cluster.voc_cluster_members m JOIN voc_cluster.voc_clusters c ON c.id=m.cluster_id
              WHERE c.workspace_id=${ws} AND c.primary_managed_system_id=${ms} AND m.voc_id IN (e.voc_id,${source}))
            AND NOT EXISTS (SELECT 1 FROM voc.voc_recommendation_decisions d WHERE d.workspace_id=${ws}
              AND d.embedding_version=${deps.embeddingVersion} AND d.state='dismissed'
              AND ((d.source_voc_id=${source} AND d.candidate_voc_id=e.voc_id) OR (d.source_voc_id=e.voc_id AND d.candidate_voc_id=${source})))
            AND NOT EXISTS (SELECT 1 FROM voc.voc_cluster_suggestions p WHERE p.workspace_id=${ws}
              AND p.voc_a_id=least(e.voc_id,${source}::uuid) AND p.voc_b_id=greatest(e.voc_id,${source}::uuid) AND p.state<>'pending')
        ) SELECT least(s.voc_id,e.voc_id) AS a,greatest(s.voc_id,e.voc_id) AS b,e.voc_id AS other,
          (s.embedding <=> e.embedding)::float8 AS distance, (1-(s.embedding <=> e.embedding))::float8 AS score,
          s.provider,s.model,s.dimensions,
          CASE WHEN s.voc_id<e.voc_id THEN s.source_hash ELSE e.source_hash END AS hash_a,
          CASE WHEN s.voc_id<e.voc_id THEN e.source_hash ELSE s.source_hash END AS hash_b,
          (CASE WHEN s.voc_id<e.voc_id THEN s.updated_at ELSE e.updated_at END)::text AS watermark_a,
          (CASE WHEN s.voc_id<e.voc_id THEN e.updated_at ELSE s.updated_at END)::text AS watermark_b
        FROM source s CROSS JOIN compatible e
        WHERE (1-(s.embedding <=> e.embedding))>=${VOC_CLUSTER_SUGGESTION_CUT}
          ${after ? sql`AND ((s.embedding <=> e.embedding)>${after.distance} OR ((s.embedding <=> e.embedding)=${after.distance} AND e.voc_id>${after.id}::uuid))` : sql``}
        ORDER BY distance,e.voc_id LIMIT ${NEIGHBOURS}`);
        for (const candidate of neighbours.rows) {
          if (
            Number.isFinite(candidate.score) &&
            (await hashesMatch(
              tx,
              ws,
              ms,
              deps.embeddingVersion,
              deps.embeddingIdentity,
              candidate,
            ))
          ) {
            candidates.set(`${candidate.a}:${candidate.b}`, candidate);
            found++;
            if (found === NEIGHBOURS) break;
          }
        }
        if (neighbours.rows.length < NEIGHBOURS) break;
        const last = neighbours.rows[neighbours.rows.length - 1];
        if (!last) break;
        after = { distance: last.distance, id: last.other };
      }
    }
    // All VOC row locks precede any suggestion write/trigger. Pin embeddings too,
    // then recheck under the locks: a concurrent text/vector change cannot slip in.
    const ids = [...new Set([...candidates.values()].flatMap((p) => [p.a, p.b]))].sort();
    await tx.execute(
      sql`SELECT id FROM voc.vocs WHERE workspace_id=${ws} AND id=ANY(${sqlUuidArray(ids)}) ORDER BY id FOR SHARE`,
    );
    await tx.execute(sql`SELECT voc_id FROM voc.voc_embeddings WHERE workspace_id=${ws}
      AND embedding_version=${deps.embeddingVersion} AND voc_id=ANY(${sqlUuidArray(ids)}) ORDER BY voc_id FOR SHARE`);
    const hourly = await tx.execute<
      { n: number } & Record<string, unknown>
    >(sql`SELECT new_admissions AS n FROM voc.voc_cluster_suggestion_admissions
      WHERE workspace_id=${ws} AND primary_managed_system_id=${ms} AND window_start=date_trunc('hour',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`);
    let admissions = hourly.rows[0]?.n ?? 0;
    let admitted = 0;
    let refreshed = 0;
    const occupied = new Set(pending.flatMap((p) => [p.voc_a_id, p.voc_b_id]));
    const sorted = [...candidates.values()].sort(
      (a, b) => b.score - a.score || a.a.localeCompare(b.a) || a.b.localeCompare(b.b),
    );
    for (const p of sorted) {
      await budget();
      if (!(await hashesMatch(tx, ws, ms, deps.embeddingVersion, deps.embeddingIdentity, p)))
        continue;
      const original = pending.find((r) => r.voc_a_id === p.a && r.voc_b_id === p.b);
      if (!original && (occupied.has(p.a) || occupied.has(p.b))) continue;
      const existing =
        await tx.execute(sql`SELECT state FROM voc.voc_cluster_suggestions WHERE workspace_id=${ws}
        AND primary_managed_system_id=${ms} AND voc_a_id=${p.a} AND voc_b_id=${p.b} FOR UPDATE`);
      if (existing.rows[0] && existing.rows[0].state !== 'pending') continue;
      const refresh = existing.rows.length > 0;
      // An ineligible existing row regaining occupancy must still respect 20.
      if (!original && occupancy >= SUGGESTION_PENDING_CAP) continue;
      if (!refresh && admissions >= SUGGESTION_HOURLY_CAP) continue;
      const changed =
        await tx.execute(sql`INSERT INTO voc.voc_cluster_suggestions(workspace_id,primary_managed_system_id,
        voc_a_id,voc_b_id,provider,model,dimensions,embedding_version,source_hash_a,source_hash_b,
        embedding_watermark_a,embedding_watermark_b,score,cut,run_correlation_id)
        VALUES(${ws},${ms},${p.a},${p.b},${p.provider},${p.model},${p.dimensions},${deps.embeddingVersion},
          ${p.hash_a},${p.hash_b},${p.watermark_a}::timestamptz,${p.watermark_b}::timestamptz,${p.score},${VOC_CLUSTER_SUGGESTION_CUT},${payload.correlation_id})
        ON CONFLICT(workspace_id,primary_managed_system_id,voc_a_id,voc_b_id) DO UPDATE SET
          provider=EXCLUDED.provider,model=EXCLUDED.model,dimensions=EXCLUDED.dimensions,embedding_version=EXCLUDED.embedding_version,
          source_hash_a=EXCLUDED.source_hash_a,source_hash_b=EXCLUDED.source_hash_b,
          embedding_watermark_a=EXCLUDED.embedding_watermark_a,embedding_watermark_b=EXCLUDED.embedding_watermark_b,
          score=EXCLUDED.score,cut=EXCLUDED.cut,run_correlation_id=EXCLUDED.run_correlation_id,refreshed_at=now(),
          revision=voc.voc_cluster_suggestions.revision+1
        WHERE voc.voc_cluster_suggestions.state='pending' AND
          (voc.voc_cluster_suggestions.provider,voc.voc_cluster_suggestions.model,voc.voc_cluster_suggestions.dimensions,
           voc.voc_cluster_suggestions.embedding_version,voc.voc_cluster_suggestions.source_hash_a,voc.voc_cluster_suggestions.source_hash_b,
           voc.voc_cluster_suggestions.embedding_watermark_a,voc.voc_cluster_suggestions.embedding_watermark_b,
           voc.voc_cluster_suggestions.score,voc.voc_cluster_suggestions.cut)
          IS DISTINCT FROM (EXCLUDED.provider,EXCLUDED.model,EXCLUDED.dimensions,EXCLUDED.embedding_version,
            EXCLUDED.source_hash_a,EXCLUDED.source_hash_b,EXCLUDED.embedding_watermark_a,EXCLUDED.embedding_watermark_b,EXCLUDED.score,EXCLUDED.cut)
        RETURNING id`);
      if (!changed.rows.length) continue;
      if (refresh) refreshed++;
      else {
        admitted++;
        admissions++;
      }
      if (!original) occupancy++;
      occupied.add(p.a);
      occupied.add(p.b);
    }
    if (admitted)
      await tx.execute(sql`INSERT INTO voc.voc_cluster_suggestion_admissions(workspace_id,primary_managed_system_id,window_start,new_admissions)
      VALUES(${ws},${ms},date_trunc('hour',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',${admitted})
      ON CONFLICT(workspace_id,primary_managed_system_id,window_start) DO UPDATE
        SET new_admissions=voc.voc_cluster_suggestion_admissions.new_admissions+EXCLUDED.new_admissions`);
    await budget();
    await writeCounter(tx, ws, occupancy);
    const last = incremental.rows[incremental.rows.length - 1];
    const wrapped = reconciliation.rows.length < SOURCE_PAGE;
    const reconciliationLast = reconciliation.rows[reconciliation.rows.length - 1];
    await tx.execute(sql`INSERT INTO voc.voc_cluster_suggestion_cursors(workspace_id,primary_managed_system_id,embedding_version,
      embedding_watermark,last_voc_id,reconciliation_after_voc_id,reconciled_at)
      VALUES(${ws},${ms},${deps.embeddingVersion},${last?.watermark ?? cursor?.watermark ?? '0001-01-01T00:00:00Z'}::timestamptz,
        ${last?.voc_id ?? cursor?.last_voc_id ?? ZERO_UUID},${wrapped ? null : (reconciliationLast?.voc_id ?? null)},
        ${wrapped ? sql`now()` : sql`${cursor?.reconciled_at ?? null}`})
      ON CONFLICT(workspace_id,primary_managed_system_id) DO UPDATE SET embedding_version=EXCLUDED.embedding_version,
        embedding_watermark=EXCLUDED.embedding_watermark,last_voc_id=EXCLUDED.last_voc_id,
        reconciliation_after_voc_id=EXCLUDED.reconciliation_after_voc_id,reconciled_at=EXCLUDED.reconciled_at,updated_at=now()`);
    return { admitted, refreshed, scanned: sources.length };
  });
}
async function hashesMatch(
  tx: Tx,
  ws: string,
  ms: string,
  version: number,
  identity: ReturnType<EmbeddingProvider['identity']>,
  p: Candidate,
) {
  if (
    p.provider !== identity.provider ||
    p.model !== identity.model ||
    p.dimensions !== identity.dimensions
  )
    return false;
  const result = await tx.execute<
    PairVoc & {
      source_hash: string;
      watermark: string;
      provider: string;
      model: string;
      dimensions: number;
    }
  >(sql`
    SELECT v.*,e.source_hash,e.updated_at::text AS watermark,e.provider,e.model,e.dimensions
    FROM voc.vocs v JOIN voc.voc_embeddings e ON e.voc_id=v.id AND e.workspace_id=v.workspace_id
    WHERE v.workspace_id=${ws} AND v.id IN (${p.a},${p.b}) AND e.embedding_version=${version} AND v.primary_managed_system_id=${ms}
      AND v.archived_at IS NULL AND e.updated_at>=v.updated_at ORDER BY v.id`);
  const hashesValid =
    result.rows.length === 2 &&
    result.rows.every(
      (v, i) =>
        v.provider === p.provider &&
        v.model === p.model &&
        v.dimensions === p.dimensions &&
        v.source_hash === (i === 0 ? p.hash_a : p.hash_b) &&
        v.watermark === (i === 0 ? p.watermark_a : p.watermark_b) &&
        deriveVocEmbeddingInput({
          title: v.title,
          descriptionRichContent: v.description_rich_content,
        }).sourceHash === v.source_hash,
    );
  if (!hashesValid) return false;
  // Recheck scoring too, including after the ordered VOC/embedding locks. A
  // replaced vector with identical text metadata must not admit an old score.
  const scoring = await tx.execute<{ score: number | null } & Record<string, unknown>>(sql`
    SELECT CASE WHEN vector_dims(a.embedding)=vector_dims(b.embedding)
      AND vector_dims(a.embedding)=${p.dimensions}
      THEN (1-(a.embedding <=> b.embedding))::float8 ELSE NULL END AS score
    FROM voc.voc_embeddings a JOIN voc.voc_embeddings b
      ON b.workspace_id=a.workspace_id AND b.embedding_version=a.embedding_version
    WHERE a.workspace_id=${ws} AND a.embedding_version=${version} AND a.voc_id=${p.a} AND b.voc_id=${p.b}`);
  return scoring.rows[0]?.score === p.score;
}
export async function runVocClusterSuggestions(deps: Deps, payload: Payload) {
  let admitted = 0;
  let refreshed = 0;
  let scanned = 0;
  let timedOut = 0;
  if (deps.embeddingEnabled) {
    const pairs = await allManagedSystemWorkspacePairs(deps.db);
    const enabledWorkspaces = new Map<string, boolean>();
    for (const pair of pairs) {
      if (payload.workspace_id && pair.workspace_id !== payload.workspace_id) continue;
      if (!enabledWorkspaces.has(pair.workspace_id)) {
        const settings = await getResolvedWorkspaceSettings(deps.db, pair.workspace_id);
        enabledWorkspaces.set(pair.workspace_id, settings.voc_cluster_suggestions_enabled);
      }
      if (!enabledWorkspaces.get(pair.workspace_id)) continue;
      // This prefilter never substitutes for the setting recheck under the lock.
      try {
        const result = await generate(deps, payload, pair.workspace_id, pair.id);
        admitted += result.admitted;
        refreshed += result.refreshed;
        scanned += result.scanned;
      } catch (error) {
        if (
          typeof error === 'object' &&
          error &&
          'code' in error &&
          (error.code === '57014' || error.code === '55P03')
        )
          timedOut++;
        else throw error;
      }
    }
  }
  const result = { admitted, refreshed, scanned, timed_out: timedOut };
  deps.log?.info('voc.cluster_suggestions.complete', {
    event: 'voc.cluster_suggestions.complete',
    ...result,
  });
  return result;
}
export async function registerVocClusterSuggestions(boss: PgBoss, deps: Deps & { log: JobLog }) {
  if (!(await boss.getQueues([VOC_CLUSTER_SUGGESTIONS_QUEUE])).length)
    throw new Error(
      `pg-boss queue '${VOC_CLUSTER_SUGGESTIONS_QUEUE}' is not pre-created. Run migrations (ADR-0009).`,
    );
  await boss.work<Payload>(
    VOC_CLUSTER_SUGGESTIONS_QUEUE,
    JOB_WORK_OPTIONS,
    withJobLogging(deps.log, VOC_CLUSTER_SUGGESTIONS_QUEUE, async (jobs) => {
      for (const job of jobs) await runVocClusterSuggestions(deps, { correlation_id: job.id });
    }),
  );
  await boss.schedule(VOC_CLUSTER_SUGGESTIONS_QUEUE, VOC_CLUSTER_SUGGESTIONS_CRON, {
    correlation_id: 'cron',
  });
}
