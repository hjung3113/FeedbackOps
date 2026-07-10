import { sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';

export interface VocClusterRow {
  id: string;
  workspace_id: string;
  display_id: string;
  title: string;
  summary: string | null;
  status: 'draft' | 'confirmed';
  primary_managed_system_id: string;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface VocClusterMemberRow {
  cluster_id: string;
  voc_id: string;
  added_by: string;
  added_at: Date;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function mapClusterRow(row: Record<string, unknown>): VocClusterRow {
  return {
    id: row.id as string,
    workspace_id: row.workspace_id as string,
    display_id: row.display_id as string,
    title: row.title as string,
    summary: (row.summary as string | null) ?? null,
    status: row.status as VocClusterRow['status'],
    primary_managed_system_id: row.primary_managed_system_id as string,
    created_by: row.created_by as string,
    created_at: toDate(row.created_at as Date | string),
    updated_at: toDate(row.updated_at as Date | string),
  };
}

function mapMemberRow(row: Record<string, unknown>): VocClusterMemberRow {
  return {
    cluster_id: row.cluster_id as string,
    voc_id: row.voc_id as string,
    added_by: row.added_by as string,
    added_at: toDate(row.added_at as Date | string),
  };
}

export async function insertVocCluster(
  tx: Tx,
  input: {
    workspaceId: string;
    title: string;
    summary: string | null;
    primaryManagedSystemId: string;
    createdBy: string;
  },
): Promise<VocClusterRow> {
  const displayRows = await tx.execute<{ v: string }>(sql`
    select core.next_display_id(${input.workspaceId}, 'cluster') as v
  `);
  const displayId = displayRows.rows[0]?.v;
  if (!displayId) {
    throw new Error('next_display_id returned empty');
  }

  const result = await tx.execute<Record<string, unknown>>(sql`
    INSERT INTO voc_cluster.voc_clusters (
      workspace_id, display_id, title, summary, status, primary_managed_system_id, created_by
    )
    VALUES (
      ${input.workspaceId}, ${displayId}, ${input.title}, ${input.summary}, 'draft',
      ${input.primaryManagedSystemId}, ${input.createdBy}
    )
    RETURNING
      id, workspace_id, display_id, title, summary, status, primary_managed_system_id,
      created_by, created_at, updated_at
  `);
  const row = result.rows[0];
  if (!row) throw new Error('insertVocCluster returned no row');
  return mapClusterRow(row);
}

export async function lockVocClusterById(
  tx: Tx,
  input: { workspaceId: string; clusterId: string },
): Promise<VocClusterRow | null> {
  const result = await tx.execute<Record<string, unknown>>(sql`
    SELECT
      id, workspace_id, display_id, title, summary, status, primary_managed_system_id,
      created_by, created_at, updated_at
    FROM voc_cluster.voc_clusters
    WHERE id = ${input.clusterId}
      AND workspace_id = ${input.workspaceId}
    FOR UPDATE
  `);
  const row = result.rows[0];
  return row ? mapClusterRow(row) : null;
}

export async function findVocClusterById(
  db: Db | Tx,
  input: { workspaceId: string; clusterId: string },
): Promise<VocClusterRow | null> {
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT
      id, workspace_id, display_id, title, summary, status, primary_managed_system_id,
      created_by, created_at, updated_at
    FROM voc_cluster.voc_clusters
    WHERE id = ${input.clusterId}
      AND workspace_id = ${input.workspaceId}
    LIMIT 1
  `);
  const row = result.rows[0];
  return row ? mapClusterRow(row) : null;
}

export async function listVocClustersByWorkspace(
  db: Db | Tx,
  input: { workspaceId: string; managedSystemId?: string },
): Promise<VocClusterRow[]> {
  const managedSystemPredicate =
    input.managedSystemId === undefined
      ? sql`TRUE`
      : sql`primary_managed_system_id = ${input.managedSystemId}`;
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT
      id, workspace_id, display_id, title, summary, status, primary_managed_system_id,
      created_by, created_at, updated_at
    FROM voc_cluster.voc_clusters
    WHERE workspace_id = ${input.workspaceId}
      AND ${managedSystemPredicate}
    ORDER BY created_at DESC, id DESC
  `);
  return result.rows.map(mapClusterRow);
}

export async function updateVocCluster(
  tx: Tx,
  input: {
    workspaceId: string;
    clusterId: string;
    title?: string;
    summary?: string | null;
    status?: 'confirmed';
  },
): Promise<VocClusterRow> {
  const setClauses: ReturnType<typeof sql>[] = [sql`updated_at = now()`];
  if (input.title !== undefined) setClauses.push(sql`title = ${input.title}`);
  if (input.summary !== undefined) setClauses.push(sql`summary = ${input.summary}`);
  if (input.status !== undefined) setClauses.push(sql`status = ${input.status}`);

  const result = await tx.execute<Record<string, unknown>>(sql`
    UPDATE voc_cluster.voc_clusters
    SET ${sql.join(setClauses, sql`, `)}
    WHERE id = ${input.clusterId}
      AND workspace_id = ${input.workspaceId}
    RETURNING
      id, workspace_id, display_id, title, summary, status, primary_managed_system_id,
      created_by, created_at, updated_at
  `);
  const row = result.rows[0];
  if (!row) throw new Error('updateVocCluster returned no row');
  return mapClusterRow(row);
}

export async function listVocClusterMembers(
  db: Db | Tx,
  input: { clusterId: string },
): Promise<VocClusterMemberRow[]> {
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT cluster_id, voc_id, added_by, added_at
    FROM voc_cluster.voc_cluster_members
    WHERE cluster_id = ${input.clusterId}
    ORDER BY added_at DESC, voc_id DESC
  `);
  return result.rows.map(mapMemberRow);
}

export async function insertVocClusterMember(
  tx: Tx,
  input: { clusterId: string; vocId: string; addedBy: string },
): Promise<{ row: VocClusterMemberRow; inserted: boolean }> {
  const inserted = await tx.execute<Record<string, unknown>>(sql`
    INSERT INTO voc_cluster.voc_cluster_members (cluster_id, voc_id, added_by)
    VALUES (${input.clusterId}, ${input.vocId}, ${input.addedBy})
    ON CONFLICT (cluster_id, voc_id) DO NOTHING
    RETURNING cluster_id, voc_id, added_by, added_at
  `);
  const row = inserted.rows[0];
  if (row) return { row: mapMemberRow(row), inserted: true };

  const existing = await tx.execute<Record<string, unknown>>(sql`
    SELECT cluster_id, voc_id, added_by, added_at
    FROM voc_cluster.voc_cluster_members
    WHERE cluster_id = ${input.clusterId}
      AND voc_id = ${input.vocId}
    LIMIT 1
  `);
  const existingRow = existing.rows[0];
  if (!existingRow) throw new Error('voc cluster member conflict did not return existing row');
  return { row: mapMemberRow(existingRow), inserted: false };
}

export async function deleteVocClusterMember(
  tx: Tx,
  input: { clusterId: string; vocId: string },
): Promise<VocClusterMemberRow | null> {
  const deleted = await tx.execute<Record<string, unknown>>(sql`
    DELETE FROM voc_cluster.voc_cluster_members
    WHERE cluster_id = ${input.clusterId}
      AND voc_id = ${input.vocId}
    RETURNING cluster_id, voc_id, added_by, added_at
  `);
  const row = deleted.rows[0];
  return row ? mapMemberRow(row) : null;
}
