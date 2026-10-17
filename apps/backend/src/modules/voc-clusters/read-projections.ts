import { sql } from 'drizzle-orm';
import { vocClusterMembers, vocClusters } from '../../db/schema/voc-cluster.js';
import type { Tx } from '../../db/tx.js';

/** Membership is provenance, not an entity-link tuple or a follow-up by itself. */
export async function readVocClusterMemberships(db: Tx, workspaceId: string, vocId: string) {
  const result = await db.execute<{ id: string }>(sql`
    SELECT c.id FROM ${vocClusters} c
    JOIN ${vocClusterMembers} m ON m.cluster_id = c.id
    WHERE c.workspace_id = ${workspaceId} AND m.voc_id = ${vocId}
    ORDER BY c.created_at, c.id
  `);
  return result.rows;
}
