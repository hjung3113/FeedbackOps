import type { DbHandle } from '../../../db/client.js';

export async function insertFindingRow(
  dbHandle: DbHandle,
  input: {
    workspaceId: string;
    primaryManagedSystemId: string;
    title?: string;
    summary?: string;
    sourceType?: 'voc' | 'voc_cluster';
    sourceId: string;
    evidenceCount?: number;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    confidence?: 'low' | 'medium' | 'high' | null;
    status?: 'draft' | 'active' | 'not_actionable' | 'converted' | 'archived';
    analyticsAreaId?: string | null;
    createdBy: string;
  },
): Promise<{ id: string; display_id: string }> {
  const res = await dbHandle.pool.query<{ id: string; display_id: string }>(
    `insert into finding.findings (
        workspace_id, display_id, primary_managed_system_id, title, summary, source_type,
        source_id, evidence_count, severity, confidence, status, analytics_area_id, created_by
      )
     values (
        $1, core.next_display_id($1::uuid, 'finding'), $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11, $12
      )
     returning id, display_id`,
    [
      input.workspaceId,
      input.primaryManagedSystemId,
      input.title ?? 'Seed finding',
      input.summary ?? 'Finding summary',
      input.sourceType ?? 'voc',
      input.sourceId,
      input.evidenceCount ?? 0,
      input.severity ?? 'medium',
      input.confidence ?? 'high',
      input.status ?? 'draft',
      input.analyticsAreaId ?? null,
      input.createdBy,
    ],
  );
  const row = res.rows[0];
  if (!row) throw new Error(`insertFindingRow failed for title=${input.title ?? 'Seed finding'}`);
  return row;
}
