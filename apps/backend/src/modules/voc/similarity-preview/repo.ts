import type { SimilarityPreviewResponse } from '@fops/shared';
import { sql } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import type { Tx } from '../../../db/tx.js';
import { type Scope, similarVocVisibilityPredicate } from '../authorization.js';
import { VOC_RECOMMENDATION_SIMILARITY_THRESHOLD } from '../recommendations/constants.js';
import {
  PREVIEW_ACTOR_DAY_CAP,
  PREVIEW_ACTOR_MINUTE_CAP,
  PREVIEW_TOMBSTONE_TTL_MS,
  PREVIEW_WORKSPACE_DAY_CAP,
  PREVIEW_WORKSPACE_MINUTE_CAP,
} from './constants.js';

export interface PreviewIdentity {
  provider: string;
  model: string;
  dimensions: number;
  embeddingVersion: number;
}
export interface PreviewKey {
  workspaceId: string;
  actorId: string;
  key: string;
}
export interface PreviewRow extends PreviewIdentity {
  id: string;
  request_hash: string;
  outcome: 'reserved' | 'succeeded' | 'failed' | 'timed_out' | 'outcome_unknown';
  vector: string | null;
  vector_expires_at: Date | null;
}
export async function findRequest(db: Tx, args: PreviewKey): Promise<PreviewRow | null> {
  const result = await db.execute<PreviewRow & Record<string, unknown>>(sql`
    SELECT id, request_hash, outcome, vector::text, vector_expires_at,
      provider, model, dimensions, embedding_version AS "embeddingVersion"
    FROM voc.voc_similarity_preview_requests
    WHERE workspace_id=${args.workspaceId} AND actor_id=${args.actorId} AND idempotency_key=${args.key}::uuid
  `);
  return result.rows[0] ?? null;
}
export interface CandidateArgs extends PreviewIdentity {
  workspaceId: string;
  actorId: string;
  managedSystemId: string;
  readScope: Scope;
}
function candidatePredicate(args: CandidateArgs) {
  return sql`v.workspace_id=${args.workspaceId} AND e.workspace_id=${args.workspaceId}
    AND v.primary_managed_system_id=${args.managedSystemId} AND v.archived_at IS NULL
    AND e.embedding_version=${args.embeddingVersion} AND e.provider=${args.provider}
    AND e.model=${args.model} AND e.dimensions=${args.dimensions}
    AND e.updated_at >= v.updated_at
    AND ${similarVocVisibilityPredicate(args.readScope, args.actorId, sql`v`)}`;
}
export async function hasCandidate(db: Db, args: CandidateArgs): Promise<boolean> {
  const result = await db.execute<{ present: boolean }>(sql`
    SELECT EXISTS(SELECT 1 FROM voc.vocs v JOIN voc.voc_embeddings e ON e.voc_id=v.id
      WHERE ${candidatePredicate(args)}) AS present
  `);
  return result.rows[0]?.present === true;
}
export async function candidates(
  db: Db,
  args: CandidateArgs,
  vector: string,
): Promise<Extract<SimilarityPreviewResponse, { available: true }>> {
  const result = await db.execute<{
    id: string;
    display_id: string;
    title: string;
    created_at: Date;
  }>(sql`
    WITH eligible AS (
      SELECT v.id, v.display_id, v.title, v.created_at,
        (1 - (e.embedding <=> ${vector}::vector))::float8 AS score
      FROM voc.vocs v JOIN voc.voc_embeddings e ON e.voc_id=v.id
      WHERE ${candidatePredicate(args)}
    ) SELECT id, display_id, title, created_at FROM eligible
      WHERE score >= ${VOC_RECOMMENDATION_SIMILARITY_THRESHOLD}
      ORDER BY score DESC, id ASC LIMIT 3
  `);
  return {
    available: true,
    items: result.rows.map((row) => ({
      ...row,
      created_at: new Date(row.created_at).toISOString(),
    })),
  };
}
export class BudgetDenied extends Error {
  constructor(
    readonly scope: 'workspace' | 'actor',
    readonly period: 'minute' | 'day',
    readonly retryAfter: number,
  ) {
    super('preview budget denied');
  }
}
export class DuplicateClaim extends Error {}
export async function reserve(
  db: Db,
  args: PreviewKey &
    PreviewIdentity & {
      managedSystemId: string;
      requestHash: string;
      now: Date;
    },
): Promise<string> {
  const minute = new Date(Math.floor(args.now.getTime() / 60_000) * 60_000);
  const day = new Date(Math.floor(args.now.getTime() / 86_400_000) * 86_400_000);
  const windows = [
    {
      scope: 'workspace',
      period: 'minute',
      start: minute,
      cap: PREVIEW_WORKSPACE_MINUTE_CAP,
      ms: 60_000,
    },
    {
      scope: 'workspace',
      period: 'day',
      start: day,
      cap: PREVIEW_WORKSPACE_DAY_CAP,
      ms: 86_400_000,
    },
    { scope: 'actor', period: 'minute', start: minute, cap: PREVIEW_ACTOR_MINUTE_CAP, ms: 60_000 },
    { scope: 'actor', period: 'day', start: day, cap: PREVIEW_ACTOR_DAY_CAP, ms: 86_400_000 },
  ] as const;
  return db.transaction(async (tx) => {
    for (const window of windows) {
      const actor = window.scope === 'actor' ? args.actorId : null;
      const scopeKey = actor ?? 'workspace';
      const result = await tx.execute(sql`
        INSERT INTO voc.voc_similarity_preview_budgets
          (workspace_id, scope, actor_id, scope_key, period, window_start, used_attempts)
        VALUES (${args.workspaceId}, ${window.scope}, ${actor}::uuid, ${scopeKey}, ${window.period}, ${window.start}, 1)
        ON CONFLICT (workspace_id, scope_key, period, window_start) DO UPDATE
          SET used_attempts = voc.voc_similarity_preview_budgets.used_attempts + 1
          WHERE voc.voc_similarity_preview_budgets.used_attempts < ${window.cap}
        RETURNING used_attempts
      `);
      if (!result.rows.length)
        throw new BudgetDenied(
          window.scope,
          window.period,
          Math.max(1, Math.ceil((window.start.getTime() + window.ms - args.now.getTime()) / 1000)),
        );
    }
    const result = await tx.execute<{ id: string }>(sql`
      INSERT INTO voc.voc_similarity_preview_requests
        (workspace_id, actor_id, idempotency_key, request_hash, primary_managed_system_id,
          provider, model, dimensions, embedding_version, reserved_at, expires_at)
      VALUES (${args.workspaceId}, ${args.actorId}, ${args.key}::uuid, ${args.requestHash}, ${args.managedSystemId},
        ${args.provider}, ${args.model}, ${args.dimensions}, ${args.embeddingVersion}, ${args.now},
        ${new Date(args.now.getTime() + PREVIEW_TOMBSTONE_TTL_MS)})
      ON CONFLICT (workspace_id, actor_id, idempotency_key) DO NOTHING RETURNING id
    `);
    const id = result.rows[0]?.id;
    if (!id) throw new DuplicateClaim();
    return id;
  });
}
export async function complete(
  db: Db,
  args: {
    id: string;
    outcome: PreviewRow['outcome'];
    now: Date;
    vector?: string;
    vectorExpiresAt?: Date;
  },
): Promise<void> {
  await db.execute(sql`UPDATE voc.voc_similarity_preview_requests SET outcome=${args.outcome},
    completed_at=${args.now}, vector=${args.vector ?? null}::vector,
    vector_expires_at=${args.vectorExpiresAt ?? null}::timestamptz
    WHERE id=${args.id} AND outcome='reserved'`);
}
export async function cleanupPreview(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`UPDATE voc.voc_similarity_preview_requests SET vector=NULL
      WHERE vector_expires_at <= statement_timestamp() AND vector IS NOT NULL`);
    await tx.execute(
      sql`DELETE FROM voc.voc_similarity_preview_requests WHERE expires_at <= statement_timestamp()`,
    );
    await tx.execute(sql`DELETE FROM voc.voc_similarity_preview_budgets WHERE window_start +
      CASE period WHEN 'minute' THEN interval '1 minute' ELSE interval '1 day' END <= statement_timestamp()`);
  });
}
