// Similar VOC count and peer read projections.
import { sql } from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import { vocs } from '../../../db/schema/voc.js';
import { sqlUuidArray } from '../../../db/sql-arrays.js';
import type { Tx } from '../../../db/tx.js';
import { type Scope, similarVocVisibilityPredicate } from '../authorization.js';

// ── Similar VOC projections (ADR-0031) ──────────────────────────────────────
//
// The peer predicate is deliberately expressed here, rather than inferred from
// source-VOC access: a reporter can read their own source VOC without voc.read,
// but must not learn whether other reporters submitted peers. Every peer is
// therefore constrained by the actor's voc.read scope OR reporter ownership.

export interface SimilarVocReadItem {
  id: string;
  displayId: string;
  title: string;
  reporterFacingStatus: string;
  severity: 'low' | 'medium' | 'high' | 'critical' | null;
}

/** Bulk count for a list page. One query covers every returned source VOC. */
export async function selectSimilarVocCounts(
  db: Db | Tx,
  args: { workspaceId: string; sourceVocIds: string[]; actorId: string; readScope: Scope },
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const { workspaceId, sourceVocIds, actorId, readScope } = args;
  if (sourceVocIds.length === 0) return out;
  const peerVisible = similarVocVisibilityPredicate(readScope, actorId, sql`p`);
  const result = await (db as Db).execute<{ source_voc_id: string; cnt: string }>(sql`
    SELECT source.id AS source_voc_id, COUNT(p.id)::text AS cnt
      FROM ${vocs} source
      JOIN ${vocs} p
        ON p.workspace_id = source.workspace_id
       AND p.primary_managed_system_id = source.primary_managed_system_id
       AND p.archived_at IS NULL
       AND p.id <> source.id
       AND ${peerVisible}
     WHERE source.workspace_id = ${workspaceId}
       AND source.id = ANY(${sqlUuidArray(sourceVocIds)})
       AND source.archived_at IS NULL
     GROUP BY source.id
  `);
  for (const row of result.rows) out.set(row.source_voc_id, Number.parseInt(row.cnt, 10));
  return out;
}

export async function selectSimilarVocCount(
  db: Db | Tx,
  args: {
    workspaceId: string;
    sourceVocId: string;
    primaryManagedSystemId: string;
    actorId: string;
    readScope: Scope;
  },
): Promise<number> {
  const { workspaceId, sourceVocId, primaryManagedSystemId, actorId, readScope } = args;
  const peerVisible = similarVocVisibilityPredicate(readScope, actorId, sql`p`);
  const result = await (db as Db).execute<{ cnt: string }>(sql`
    SELECT COUNT(p.id)::text AS cnt
      FROM ${vocs} p
     WHERE p.workspace_id = ${workspaceId}
       AND p.primary_managed_system_id = ${primaryManagedSystemId}
       AND p.archived_at IS NULL
       AND p.id <> ${sourceVocId}
       AND ${peerVisible}
  `);
  return Number.parseInt(result.rows[0]?.cnt ?? '0', 10);
}

export async function selectSimilarVocItems(
  db: Db | Tx,
  args: {
    workspaceId: string;
    sourceVocId: string;
    primaryManagedSystemId: string;
    actorId: string;
    readScope: Scope;
  },
): Promise<SimilarVocReadItem[]> {
  const { workspaceId, sourceVocId, primaryManagedSystemId, actorId, readScope } = args;
  const peerVisible = similarVocVisibilityPredicate(readScope, actorId, sql`p`);
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT p.id, p.display_id, p.title, p.reporter_facing_status, p.severity
      FROM ${vocs} p
     WHERE p.workspace_id = ${workspaceId}
       AND p.primary_managed_system_id = ${primaryManagedSystemId}
       AND p.archived_at IS NULL
       AND p.id <> ${sourceVocId}
       AND ${peerVisible}
     ORDER BY p.created_at DESC, p.id DESC
     LIMIT 3
  `);
  return result.rows.map((row) => ({
    id: row.id as string,
    displayId: row.display_id as string,
    title: row.title as string,
    reporterFacingStatus: row.reporter_facing_status as string,
    severity: (row.severity as SimilarVocReadItem['severity']) ?? null,
  }));
}
