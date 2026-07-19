import { sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import type { FindingReadRow } from './repo-read.js';
import { mapFindingRow } from './repo-read.js';

export interface InsertFindingInput {
  workspaceId: string;
  primaryManagedSystemId: string;
  title: string;
  summary: string;
  sourceType: 'voc' | 'voc_cluster' | 'survey_response';
  sourceId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: 'low' | 'medium' | 'high' | null;
  analyticsAreaId: string | null;
  createdBy: string;
}

export async function insertFinding(tx: Tx, input: InsertFindingInput): Promise<FindingReadRow> {
  const displayRows = await tx.execute<{ v: string }>(sql`
    select core.next_display_id(${input.workspaceId}, 'finding') as v
  `);
  const displayId = displayRows.rows[0]?.v;
  if (!displayId) {
    throw new Error('next_display_id returned empty');
  }

  const result = await tx.execute<Record<string, unknown>>(sql`
    INSERT INTO finding.findings (
      workspace_id, display_id, primary_managed_system_id, title, summary, source_type,
      source_id, evidence_count, severity, confidence, status,
      analytics_area_id, created_by
    )
    VALUES (
      ${input.workspaceId}, ${displayId}, ${input.primaryManagedSystemId}, ${input.title},
      ${input.summary}, ${input.sourceType}, ${input.sourceId}, 0, ${input.severity},
      ${input.confidence}, 'draft', ${input.analyticsAreaId}, ${input.createdBy}
    )
    RETURNING
      id, workspace_id, display_id, primary_managed_system_id, title, summary, source_type,
      source_id, evidence_count, severity, confidence, status, analytics_area_id,
      linked_task_id, linked_milestone_id, created_by, created_at, updated_at
  `);
  const row = result.rows[0];
  if (!row) throw new Error('insertFinding returned no row');
  return mapFindingRow(row);
}

export interface EvidenceHighlightRow {
  id: string;
  workspace_id: string;
  finding_id: string;
  primary_managed_system_id: string;
  source_type: 'voc' | 'survey_response' | 'note';
  source_id: string | null;
  approved_excerpt_id: string | null;
  quote_or_summary: string;
  analytics_area_id: string | null;
  sentiment: 'negative' | 'neutral' | 'positive' | null;
  importance: 'low' | 'medium' | 'high' | null;
  created_by: string;
  created_at: Date;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function sqlUuidArray(ids: string[]): ReturnType<typeof sql> {
  if (ids.length === 0) return sql`ARRAY[]::uuid[]`;
  const items = ids.map((id) => sql`${id}::uuid`);
  return sql`ARRAY[${sql.join(items, sql`, `)}]::uuid[]`;
}

export function mapEvidenceHighlightRow(row: Record<string, unknown>): EvidenceHighlightRow {
  return {
    id: row.id as string,
    workspace_id: row.workspace_id as string,
    finding_id: row.finding_id as string,
    primary_managed_system_id: row.primary_managed_system_id as string,
    source_type: row.source_type as EvidenceHighlightRow['source_type'],
    source_id: (row.source_id as string | null) ?? null,
    approved_excerpt_id: (row.approved_excerpt_id as string | null) ?? null,
    quote_or_summary: row.quote_or_summary as string,
    analytics_area_id: (row.analytics_area_id as string | null) ?? null,
    sentiment: (row.sentiment as EvidenceHighlightRow['sentiment']) ?? null,
    importance: (row.importance as EvidenceHighlightRow['importance']) ?? null,
    created_by: row.created_by as string,
    created_at: toDate(row.created_at as Date | string),
  };
}

export async function lockFindingById(
  tx: Tx,
  input: { workspaceId: string; findingId: string },
): Promise<FindingReadRow | null> {
  const result = await tx.execute<Record<string, unknown>>(sql`
    SELECT
      id, workspace_id, display_id, primary_managed_system_id, title, summary, source_type,
      source_id, evidence_count, severity, confidence, status, analytics_area_id,
      linked_task_id, linked_milestone_id, created_by, created_at, updated_at
    FROM finding.findings
    WHERE id = ${input.findingId}
      AND workspace_id = ${input.workspaceId}
    FOR UPDATE
  `);
  const row = result.rows[0];
  return row ? mapFindingRow(row) : null;
}

export async function insertEvidenceHighlight(
  tx: Tx,
  input: {
    workspaceId: string;
    findingId: string;
    primaryManagedSystemId: string;
    sourceType: 'voc' | 'survey_response' | 'note';
    sourceId: string | null;
    approvedExcerptId: string | null;
    quoteOrSummary: string;
    analyticsAreaId: string | null;
    sentiment: 'negative' | 'neutral' | 'positive' | null;
    importance: 'low' | 'medium' | 'high' | null;
    createdBy: string;
  },
): Promise<EvidenceHighlightRow> {
  const result = await tx.execute<Record<string, unknown>>(sql`
    INSERT INTO finding.evidence_highlights (
      workspace_id, finding_id, primary_managed_system_id, source_type,
      source_id, approved_excerpt_id, quote_or_summary, analytics_area_id, sentiment, importance, created_by
    )
    VALUES (
      ${input.workspaceId}, ${input.findingId}, ${input.primaryManagedSystemId},
      ${input.sourceType}, ${input.sourceId}, ${input.approvedExcerptId}, ${input.quoteOrSummary}, ${input.analyticsAreaId},
      ${input.sentiment}, ${input.importance}, ${input.createdBy}
    )
    RETURNING
      id, workspace_id, finding_id, primary_managed_system_id, source_type,
      source_id, approved_excerpt_id, quote_or_summary, analytics_area_id, sentiment, importance,
      created_by, created_at
  `);
  const row = result.rows[0];
  if (!row) throw new Error('insertEvidenceHighlight returned no row');
  return mapEvidenceHighlightRow(row);
}

export async function incrementFindingEvidenceCount(
  tx: Tx,
  input: { workspaceId: string; findingId: string },
): Promise<number> {
  const result = await tx.execute<{ evidence_count: number }>(sql`
    UPDATE finding.findings
    SET evidence_count = evidence_count + 1,
        updated_at = now()
    WHERE id = ${input.findingId}
      AND workspace_id = ${input.workspaceId}
    RETURNING evidence_count
  `);
  const row = result.rows[0];
  if (!row) throw new Error('incrementFindingEvidenceCount returned no row');
  return Number(row.evidence_count);
}

export async function updateFindingStatus(
  tx: Tx,
  input: {
    workspaceId: string;
    findingId: string;
    status: FindingReadRow['status'];
  },
): Promise<FindingReadRow> {
  const result = await tx.execute<Record<string, unknown>>(sql`
    UPDATE finding.findings
    SET status = ${input.status},
        updated_at = now()
    WHERE id = ${input.findingId}
      AND workspace_id = ${input.workspaceId}
    RETURNING
      id, workspace_id, display_id, primary_managed_system_id, title, summary, source_type,
      source_id, evidence_count, severity, confidence, status, analytics_area_id,
      linked_task_id, linked_milestone_id, created_by, created_at, updated_at
  `);
  const row = result.rows[0];
  if (!row) throw new Error('updateFindingStatus returned no row');
  return mapFindingRow(row);
}

export async function updateFindingLinkedTask(
  tx: Tx,
  input: { workspaceId: string; findingId: string; taskId: string },
): Promise<FindingReadRow> {
  const result = await tx.execute<Record<string, unknown>>(sql`
    UPDATE finding.findings
    SET linked_task_id = ${input.taskId},
        updated_at = now()
    WHERE id = ${input.findingId}
      AND workspace_id = ${input.workspaceId}
    RETURNING
      id, workspace_id, display_id, primary_managed_system_id, title, summary, source_type,
      source_id, evidence_count, severity, confidence, status, analytics_area_id,
      linked_task_id, linked_milestone_id, created_by, created_at, updated_at
  `);
  const row = result.rows[0];
  if (!row) throw new Error('updateFindingLinkedTask returned no row');
  return mapFindingRow(row);
}

export async function listEvidenceHighlightsByFinding(
  db: Db | Tx,
  input: { workspaceId: string; findingId: string },
): Promise<EvidenceHighlightRow[]> {
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT
      id, workspace_id, finding_id, primary_managed_system_id, source_type,
      source_id, approved_excerpt_id, quote_or_summary, analytics_area_id, sentiment, importance,
      created_by, created_at
    FROM finding.evidence_highlights
    WHERE workspace_id = ${input.workspaceId}
      AND finding_id = ${input.findingId}
    ORDER BY created_at DESC, id DESC
  `);
  return result.rows.map(mapEvidenceHighlightRow);
}

export interface VocSourceMetaRow {
  id: string;
  title: string;
  display_id: string;
}

function mapVocSourceMetaRow(row: Record<string, unknown>): VocSourceMetaRow {
  return {
    id: row.id as string,
    title: row.title as string,
    display_id: row.display_id as string,
  };
}

export async function findVocSourceMeta(
  db: Db | Tx,
  input: { workspaceId: string; vocId: string },
): Promise<VocSourceMetaRow | null> {
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT id, title, display_id
    FROM voc.vocs
    WHERE workspace_id = ${input.workspaceId}
      AND id = ${input.vocId}
    LIMIT 1
  `);
  const row = result.rows[0];
  return row ? mapVocSourceMetaRow(row) : null;
}

export async function listVocSourceMeta(
  db: Db | Tx,
  input: { workspaceId: string; vocIds: string[] },
): Promise<VocSourceMetaRow[]> {
  if (input.vocIds.length === 0) return [];
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT id, title, display_id
    FROM voc.vocs
    WHERE workspace_id = ${input.workspaceId}
      AND id = ANY(${sqlUuidArray(input.vocIds)})
  `);
  return result.rows.map(mapVocSourceMetaRow);
}

export { findFindingById } from './repo-read.js';
export type { FindingReadRow } from './repo-read.js';
