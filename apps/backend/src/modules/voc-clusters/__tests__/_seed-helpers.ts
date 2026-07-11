import type { DbHandle } from '../../../db/client.js';

export async function insertVocClusterRow(
  dbHandle: DbHandle,
  input: {
    workspaceId: string;
    title?: string;
    summary?: string | null;
    status?: 'draft' | 'confirmed';
    primaryManagedSystemId: string;
    createdBy: string;
  },
): Promise<{ id: string; display_id: string }> {
  const res = await dbHandle.pool.query<{ id: string; display_id: string }>(
    `insert into voc_cluster.voc_clusters (
        workspace_id, display_id, title, summary, status, primary_managed_system_id, created_by
      )
     values (
        $1, core.next_display_id($1::uuid, 'cluster'), $2, $3, $4, $5, $6
      )
     returning id, display_id`,
    [
      input.workspaceId,
      input.title ?? 'Seed cluster',
      input.summary ?? null,
      input.status ?? 'draft',
      input.primaryManagedSystemId,
      input.createdBy,
    ],
  );
  const row = res.rows[0];
  if (!row) throw new Error(`insertVocClusterRow failed for title=${input.title ?? 'Seed cluster'}`);
  return row;
}
