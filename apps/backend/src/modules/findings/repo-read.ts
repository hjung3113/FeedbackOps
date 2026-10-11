import { sql } from 'drizzle-orm';
import type { ListCursor } from './list-cursor.js';

import type { Db } from '../../db/client.js';
import { findings } from '../../db/schema/finding.js';
import type { Tx } from '../../db/tx.js';

export interface FindingReadRow {
  cursor_timestamp?: string;
  id: string;
  workspace_id: string;
  display_id: string;
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

export function mapFindingRow(row: Record<string, unknown>): FindingReadRow {
  return {
    ...(row.cursor_timestamp == null ? {} : { cursor_timestamp: String(row.cursor_timestamp) }),
    id: row.id as string,
    workspace_id: row.workspace_id as string,
    display_id: row.display_id as string,
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
      id, workspace_id, display_id, primary_managed_system_id, title, summary, source_type,
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

// Display id → id for /nav/resolve (#731). Same row population findFindingById
// reads: no status/archived filter, mirroring the Finding detail read.
export async function findFindingIdByDisplayId(
  db: Db | Tx,
  input: { workspaceId: string; displayId: string },
): Promise<{ id: string; primary_managed_system_id: string } | null> {
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT id, primary_managed_system_id
    FROM ${findings}
    WHERE display_id = ${input.displayId}
      AND workspace_id = ${input.workspaceId}
    LIMIT 1
  `);
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id as string,
    primary_managed_system_id: row.primary_managed_system_id as string,
  };
}

interface ListInput {
  workspaceId: string;
  managedSystemId?: string;
  execution?: 'none';
  allowedSystemIds?: string[];
  limit?: number;
  cursor?: ListCursor;
}

function listPredicates(input: ListInput) {
  const managedSystemPredicate =
    input.managedSystemId === undefined
      ? sql`TRUE`
      : sql`f.primary_managed_system_id = ${input.managedSystemId}`;
  // Same three conditions as countActiveFindingsWithoutExecution (dashboard/repo.ts).
  // Do not import that function: dashboard must not become a findings dependency.
  const executionPredicate =
    input.execution === 'none'
      ? sql`f.status = 'active'
          AND f.linked_task_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM core.entity_links el
            WHERE el.workspace_id = f.workspace_id
              AND el.status = 'active'
              AND el.source_type = 'finding'
              AND el.source_id = f.id
              AND el.target_type = 'task_request'
              AND el.relation_type = 'requested_task'
          )`
      : sql`TRUE`;
  const predicates = [
    sql`f.workspace_id = ${input.workspaceId}`,
    managedSystemPredicate,
    executionPredicate,
  ];
  if (input.allowedSystemIds !== undefined)
    predicates.push(
      sql`f.primary_managed_system_id = ANY(${sql.param(input.allowedSystemIds)}::uuid[])`,
    );
  return predicates;
}

export async function listFindingsByWorkspace(
  db: Db | Tx,
  input: ListInput,
): Promise<FindingReadRow[]> {
  const predicates = listPredicates(input);
  if (input.cursor !== undefined)
    predicates.push(
      sql`(f.created_at, f.id) < (${input.cursor.timestamp}::timestamptz, ${input.cursor.id}::uuid)`,
    );
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT
      f.created_at::text AS cursor_timestamp,
      f.id, f.workspace_id, f.display_id, f.primary_managed_system_id, f.title, f.summary, f.source_type,
      f.source_id, f.evidence_count, f.severity, f.confidence, f.status, f.analytics_area_id,
      f.linked_task_id, f.linked_milestone_id, f.created_by, f.created_at, f.updated_at
    FROM ${findings} f
    WHERE ${sql.join(predicates, sql` AND `)}
    ORDER BY f.created_at DESC, f.id DESC
    ${input.limit === undefined ? sql`` : sql`LIMIT ${input.limit + 1}`}
  `);
  return result.rows.map(mapFindingRow);
}
export async function countListRows(db: Db | Tx, input: ListInput): Promise<number> {
  const result = await (db as Db).execute<{ total: number }>(sql`
    SELECT count(*)::int AS total FROM finding.findings f
    WHERE ${sql.join(listPredicates(input), sql` AND `)}
  `);
  return Number(result.rows[0]?.total ?? 0);
}

export async function listPrimaryManagedSystemIds(
  db: Db | Tx,
  input: { workspaceId: string; managedSystemId?: string },
): Promise<string[]> {
  const result = await (db as Db).execute<{ id: string }>(sql`
    SELECT DISTINCT primary_managed_system_id AS id FROM finding.findings
    WHERE workspace_id = ${input.workspaceId}
    ${input.managedSystemId === undefined ? sql`` : sql`AND primary_managed_system_id = ${input.managedSystemId}`}
  `);
  return result.rows.map((row) => row.id);
}

export interface FindingSourceLinkRow {
  link_id: string;
  source_type: 'voc' | 'voc_cluster';
  source_id: string;
  relation_type: 'created_finding';
}

export async function findCreatedFindingSourceLink(
  db: Db | Tx,
  input: { workspaceId: string; findingId: string },
): Promise<FindingSourceLinkRow | null> {
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT id AS link_id, source_type, source_id, relation_type
    FROM core.entity_links
    WHERE workspace_id = ${input.workspaceId}
      AND target_type = 'finding'
      AND target_id = ${input.findingId}
      AND relation_type = 'created_finding'
      AND status = 'active'
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `);
  const row = result.rows[0];
  if (!row) return null;
  return {
    link_id: row.link_id as string,
    source_type: row.source_type as 'voc' | 'voc_cluster',
    source_id: row.source_id as string,
    relation_type: row.relation_type as 'created_finding',
  };
}

// #514 A9 — earliest Finding whose linked_milestone_id points at a Milestone.
// Read-only: no application writer sets linked_milestone_id. Multiple rows are
// possible (column is non-unique); the detail DTO carries one object, so the
// tiebreak is earliest created_at, then id.
export interface MilestoneSourceFindingRow {
  id: string;
  display_id: string;
  title: string;
  summary: string;
  evidence_count: number;
}

export async function findSourceFindingForMilestone(
  db: Db | Tx,
  input: { workspaceId: string; milestoneId: string },
): Promise<MilestoneSourceFindingRow | null> {
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT id, display_id, title, summary, evidence_count
    FROM ${findings}
    WHERE workspace_id = ${input.workspaceId}
      AND linked_milestone_id = ${input.milestoneId}
    ORDER BY created_at ASC, id ASC
    LIMIT 1
  `);
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id as string,
    display_id: row.display_id as string,
    title: row.title as string,
    summary: row.summary as string,
    evidence_count: Number(row.evidence_count),
  };
}
