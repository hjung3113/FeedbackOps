import { sql } from 'drizzle-orm';

import type { Tx } from '../../db/tx.js';
import type { FindingReadRow } from './repo-read.js';
import { mapFindingRow } from './repo-read.js';

export interface InsertFindingInput {
  workspaceId: string;
  primaryManagedSystemId: string;
  title: string;
  summary: string;
  sourceType: 'voc';
  sourceId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: 'low' | 'medium' | 'high' | null;
  analyticsAreaId: string | null;
  createdBy: string;
}

export async function insertFinding(tx: Tx, input: InsertFindingInput): Promise<FindingReadRow> {
  const result = await tx.execute<Record<string, unknown>>(sql`
    INSERT INTO finding.findings (
      workspace_id, primary_managed_system_id, title, summary, source_type,
      source_id, evidence_count, severity, confidence, status,
      analytics_area_id, created_by
    )
    VALUES (
      ${input.workspaceId}, ${input.primaryManagedSystemId}, ${input.title}, ${input.summary},
      ${input.sourceType}, ${input.sourceId}, 0, ${input.severity}, ${input.confidence},
      'draft', ${input.analyticsAreaId}, ${input.createdBy}
    )
    RETURNING
      id, workspace_id, primary_managed_system_id, title, summary, source_type,
      source_id, evidence_count, severity, confidence, status, analytics_area_id,
      linked_task_id, linked_milestone_id, created_by, created_at, updated_at
  `);
  const row = result.rows[0];
  if (!row) throw new Error('insertFinding returned no row');
  return mapFindingRow(row);
}

export { findFindingById } from './repo-read.js';
export type { FindingReadRow } from './repo-read.js';
