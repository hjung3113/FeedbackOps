import { sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import { findings } from '../../db/schema/finding.js';
import type { Tx } from '../../db/tx.js';

export interface FindingReadRow {
  id: string;
  workspace_id: string;
  primary_managed_system_id: string;
  title: string;
  summary: string;
  source_type: 'voc' | 'voc_cluster' | 'survey' | 'manual';
  source_id: string | null;
  evidence_count: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: 'low' | 'medium' | 'high' | null;
  status: 'draft' | 'active' | 'not_actionable' | 'converted' | 'archived';
  analytics_area_id: string | null;
  linked_task_id: string | null;
  linked_milestone_id: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function mapFindingRow(row: Record<string, unknown>): FindingReadRow {
  return {
    id: row.id as string,
    workspace_id: row.workspace_id as string,
    primary_managed_system_id: row.primary_managed_system_id as string,
    title: row.title as string,
    summary: row.summary as string,
    source_type: row.source_type as FindingReadRow['source_type'],
    source_id: (row.source_id as string | null) ?? null,
    evidence_count: Number(row.evidence_count),
    severity: row.severity as FindingReadRow['severity'],
    confidence: (row.confidence as FindingReadRow['confidence']) ?? null,
    status: row.status as FindingReadRow['status'],
    analytics_area_id: (row.analytics_area_id as string | null) ?? null,
    linked_task_id: (row.linked_task_id as string | null) ?? null,
    linked_milestone_id: (row.linked_milestone_id as string | null) ?? null,
    created_by: row.created_by as string,
    created_at: toDate(row.created_at as Date | string),
    updated_at: toDate(row.updated_at as Date | string),
  };
}

export async function findFindingById(
  db: Db | Tx,
  input: { workspaceId: string; findingId: string },
): Promise<FindingReadRow | null> {
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT
      id, workspace_id, primary_managed_system_id, title, summary, source_type,
      source_id, evidence_count, severity, confidence, status, analytics_area_id,
      linked_task_id, linked_milestone_id, created_by, created_at, updated_at
    FROM ${findings}
    WHERE id = ${input.findingId}
      AND workspace_id = ${input.workspaceId}
    LIMIT 1
  `);
  const row = result.rows[0];
  return row ? mapFindingRow(row) : null;
}
