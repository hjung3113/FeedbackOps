import { sql } from 'drizzle-orm';
import { sqlUuidArray } from '../../db/sql-arrays.js';
import type { Tx } from '../../db/tx.js';

/** Cluster follow-up links change the high/no-link predicate of every member VOC. */
export async function readClusterRecoveryMembers(
  tx: Tx,
  workspaceId: string,
  clusterIds: string[],
) {
  if (clusterIds.length === 0) return [];
  const rows = await tx.execute<{ id: string }>(sql`
    SELECT DISTINCT member.voc_id AS id FROM voc_cluster.voc_cluster_members member
    JOIN voc_cluster.voc_clusters cluster ON cluster.id=member.cluster_id
    WHERE cluster.workspace_id=${workspaceId}::uuid AND cluster.id=ANY(${sqlUuidArray(clusterIds)})
    ORDER BY member.voc_id`);
  return rows.rows.map((row) => ({ type: 'voc' as const, id: row.id }));
}
