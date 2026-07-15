import { sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import type { Scope } from '../permissions/scope-service.js';

export interface VocClusterRow {
  id: string;
  workspace_id: string;
  display_id: string;
  title: string;
  summary: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical' | null;
  confidence: 'low' | 'medium' | 'high' | null;
  rationale: string | null;
  owner_user_id: string | null;
  status: 'draft' | 'confirmed';
  primary_managed_system_id: string;
  created_by: string;
  confirmed_by: string | null;
  confirmed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  member_count: number;
}

export interface VocClusterMemberRow {
  cluster_id: string;
  voc_id: string;
  added_by: string;
  added_at: Date;
  display_id?: string;
  title?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical' | null;
  reporter_facing_status?: string;
  primary_managed_system_id?: string;
  reporter_id?: string;
  archived_at?: Date | null;
}

export interface SameManagedSystemCandidatePeerRow {
  voc_id: string;
  display_id: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical' | null;
  reporter_facing_status: string;
  primary_managed_system_id: string;
  reporter_id: string;
  archived_at: Date | null;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function sqlUuidArray(ids: string[]): ReturnType<typeof sql> {
  if (ids.length === 0) return sql`ARRAY[]::uuid[]`;
  const items = ids.map((id) => sql`${id}::uuid`);
  return sql`ARRAY[${sql.join(items, sql`, `)}]::uuid[]`;
}

function mapClusterRow(row: Record<string, unknown>): VocClusterRow {
  return {
    id: row.id as string,
    workspace_id: row.workspace_id as string,
    display_id: row.display_id as string,
    title: row.title as string,
    summary: (row.summary as string | null) ?? null,
    severity: (row.severity as VocClusterRow['severity']) ?? null,
    confidence: (row.confidence as VocClusterRow['confidence']) ?? null,
    rationale: (row.rationale as string | null) ?? null,
    owner_user_id: (row.owner_user_id as string | null) ?? null,
    status: row.status as VocClusterRow['status'],
    primary_managed_system_id: row.primary_managed_system_id as string,
    created_by: row.created_by as string,
    confirmed_by: (row.confirmed_by as string | null) ?? null,
    confirmed_at:
      row.confirmed_at === null || row.confirmed_at === undefined
        ? null
        : toDate(row.confirmed_at as Date | string),
    created_at: toDate(row.created_at as Date | string),
    updated_at: toDate(row.updated_at as Date | string),
    member_count: Number(row.member_count),
  };
}

function mapMemberRow(row: Record<string, unknown>): VocClusterMemberRow {
  return {
    cluster_id: row.cluster_id as string,
    voc_id: row.voc_id as string,
    added_by: row.added_by as string,
    added_at: toDate(row.added_at as Date | string),
    ...(row.display_id !== undefined ? { display_id: row.display_id as string } : {}),
    ...(row.title !== undefined ? { title: row.title as string } : {}),
    ...(row.severity !== undefined
      ? { severity: (row.severity as VocClusterMemberRow['severity']) ?? null }
      : {}),
    ...(row.reporter_facing_status !== undefined
      ? { reporter_facing_status: row.reporter_facing_status as string }
      : {}),
    ...(row.primary_managed_system_id !== undefined
      ? { primary_managed_system_id: row.primary_managed_system_id as string }
      : {}),
    ...(row.reporter_id !== undefined ? { reporter_id: row.reporter_id as string } : {}),
    ...(row.archived_at !== undefined
      ? { archived_at: row.archived_at === null ? null : toDate(row.archived_at as Date | string) }
      : {}),
  };
}

function mapCandidatePeerRow(row: Record<string, unknown>): SameManagedSystemCandidatePeerRow {
  return {
    voc_id: row.voc_id as string,
    display_id: row.display_id as string,
    title: row.title as string,
    severity: (row.severity as SameManagedSystemCandidatePeerRow['severity']) ?? null,
    reporter_facing_status: row.reporter_facing_status as string,
    primary_managed_system_id: row.primary_managed_system_id as string,
    reporter_id: row.reporter_id as string,
    archived_at: row.archived_at === null ? null : toDate(row.archived_at as Date | string),
  };
}

export interface CreatedFindingForClusterRow {
  cluster_id: string;
  id: string;
  display_id: string;
  status: 'draft' | 'active' | 'not_actionable' | 'converted' | 'archived';
}

function mapCreatedFindingForClusterRow(row: Record<string, unknown>): CreatedFindingForClusterRow {
  return {
    cluster_id: row.cluster_id as string,
    id: row.id as string,
    display_id: row.display_id as string,
    status: row.status as CreatedFindingForClusterRow['status'],
  };
}

export async function insertVocCluster(
  tx: Tx,
  input: {
    workspaceId: string;
    title: string;
    summary: string | null;
    severity: VocClusterRow['severity'];
    confidence: VocClusterRow['confidence'];
    rationale: string | null;
    ownerUserId: string | null;
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
      workspace_id, display_id, title, summary, severity, confidence, rationale, owner_user_id,
      status, primary_managed_system_id, created_by
    )
    VALUES (
      ${input.workspaceId}, ${displayId}, ${input.title}, ${input.summary}, ${input.severity},
      ${input.confidence}, ${input.rationale}, ${input.ownerUserId}, 'draft',
      ${input.primaryManagedSystemId}, ${input.createdBy}
    )
    RETURNING
      id, workspace_id, display_id, title, summary, severity, confidence, rationale, owner_user_id,
      status, primary_managed_system_id, created_by, confirmed_by, confirmed_at, created_at, updated_at,
      (
        SELECT count(*)::int
        FROM voc_cluster.voc_cluster_members m
        WHERE m.cluster_id = id
      ) AS member_count
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
      c.id, c.workspace_id, c.display_id, c.title, c.summary, c.severity, c.confidence,
      c.rationale, c.owner_user_id, c.status, c.primary_managed_system_id, c.created_by,
      c.confirmed_by, c.confirmed_at, c.created_at, c.updated_at,
      (
        SELECT count(*)::int
        FROM voc_cluster.voc_cluster_members m
        WHERE m.cluster_id = c.id
      ) AS member_count
    FROM voc_cluster.voc_clusters c
    WHERE c.id = ${input.clusterId}
      AND c.workspace_id = ${input.workspaceId}
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
      c.id, c.workspace_id, c.display_id, c.title, c.summary, c.severity, c.confidence,
      c.rationale, c.owner_user_id, c.status, c.primary_managed_system_id, c.created_by,
      c.confirmed_by, c.confirmed_at, c.created_at, c.updated_at,
      (
        SELECT count(*)::int
        FROM voc_cluster.voc_cluster_members m
        WHERE m.cluster_id = c.id
      ) AS member_count
    FROM voc_cluster.voc_clusters c
    WHERE c.id = ${input.clusterId}
      AND c.workspace_id = ${input.workspaceId}
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
      : sql`c.primary_managed_system_id = ${input.managedSystemId}`;
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT
      c.id, c.workspace_id, c.display_id, c.title, c.summary, c.severity, c.confidence,
      c.rationale, c.owner_user_id, c.status, c.primary_managed_system_id, c.created_by,
      c.confirmed_by, c.confirmed_at, c.created_at, c.updated_at,
      (
        SELECT count(*)::int
        FROM voc_cluster.voc_cluster_members m
        JOIN voc.vocs v ON v.id = m.voc_id
        WHERE m.cluster_id = c.id
          AND v.archived_at IS NULL
          AND v.primary_managed_system_id = c.primary_managed_system_id
      ) AS member_count
    FROM voc_cluster.voc_clusters c
    WHERE c.workspace_id = ${input.workspaceId}
      AND ${managedSystemPredicate}
    ORDER BY c.created_at DESC, c.id DESC
  `);
  return result.rows.map(mapClusterRow);
}

export async function listCreatedFindingsForClusters(
  db: Db | Tx,
  input: { workspaceId: string; clusterIds: string[]; findingReadScope: Scope },
): Promise<CreatedFindingForClusterRow[]> {
  if (input.clusterIds.length === 0) return [];
  const findingScopePredicate =
    input.findingReadScope.kind === 'all'
      ? sql`TRUE`
      : sql`f.primary_managed_system_id = ANY(${sqlUuidArray(input.findingReadScope.managedSystemIds)})`;
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT l.source_id AS cluster_id, f.id, f.display_id, f.status
    FROM core.entity_links l
    JOIN finding.findings f
      ON f.id = l.target_id
      AND f.workspace_id = l.workspace_id
    WHERE l.workspace_id = ${input.workspaceId}
      AND l.source_type = 'voc_cluster'
      AND l.source_id = ANY(${sqlUuidArray(input.clusterIds)})
      AND l.target_type = 'finding'
      AND l.relation_type IN ('created_finding', 'evidence_of')
      AND l.status = 'active'
      AND ${findingScopePredicate}
    ORDER BY l.created_at DESC, l.id DESC
  `);
  return result.rows.map(mapCreatedFindingForClusterRow);
}

export async function updateVocCluster(
  tx: Tx,
  input: {
    workspaceId: string;
    clusterId: string;
    title?: string;
    summary?: string | null;
    severity?: VocClusterRow['severity'];
    confidence?: VocClusterRow['confidence'];
    rationale?: string | null;
    ownerUserId?: string | null;
    status?: 'confirmed';
    confirmedBy?: string;
  },
): Promise<VocClusterRow> {
  const setClauses: ReturnType<typeof sql>[] = [sql`updated_at = now()`];
  if (input.title !== undefined) setClauses.push(sql`title = ${input.title}`);
  if (input.summary !== undefined) setClauses.push(sql`summary = ${input.summary}`);
  if (input.severity !== undefined) setClauses.push(sql`severity = ${input.severity}`);
  if (input.confidence !== undefined) setClauses.push(sql`confidence = ${input.confidence}`);
  if (input.rationale !== undefined) setClauses.push(sql`rationale = ${input.rationale}`);
  if (input.ownerUserId !== undefined) setClauses.push(sql`owner_user_id = ${input.ownerUserId}`);
  if (input.status !== undefined) setClauses.push(sql`status = ${input.status}`);
  if (input.confirmedBy !== undefined) {
    setClauses.push(sql`confirmed_by = ${input.confirmedBy}`);
    setClauses.push(sql`confirmed_at = now()`);
  }

  const result = await tx.execute<Record<string, unknown>>(sql`
    UPDATE voc_cluster.voc_clusters
    SET ${sql.join(setClauses, sql`, `)}
    WHERE id = ${input.clusterId}
      AND workspace_id = ${input.workspaceId}
    RETURNING
      id, workspace_id, display_id, title, summary, severity, confidence, rationale, owner_user_id,
      status, primary_managed_system_id, created_by, confirmed_by, confirmed_at, created_at, updated_at,
      (
        SELECT count(*)::int
        FROM voc_cluster.voc_cluster_members m
        WHERE m.cluster_id = id
      ) AS member_count
  `);
  const row = result.rows[0];
  if (!row) throw new Error('updateVocCluster returned no row');
  return mapClusterRow(row);
}

export async function isAssignableClusterOwner(
  tx: Tx,
  input: { workspaceId: string; actorId: string },
): Promise<boolean> {
  const result = await tx.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1
      FROM core.actors
      WHERE id = ${input.actorId}
        AND workspace_id = ${input.workspaceId}
        AND actor_type = 'internal_member'
    ) AS exists
  `);
  return result.rows[0]?.exists === true;
}

export async function listVocClusterMembers(
  db: Db | Tx,
  input: { clusterId: string },
): Promise<VocClusterMemberRow[]> {
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT m.cluster_id, m.voc_id, m.added_by, m.added_at,
           v.display_id, v.title, v.severity, v.reporter_facing_status,
           v.primary_managed_system_id, v.reporter_id, v.archived_at
    FROM voc_cluster.voc_cluster_members m
    JOIN voc.vocs v ON v.id = m.voc_id
    WHERE m.cluster_id = ${input.clusterId}
    ORDER BY m.added_at DESC, m.voc_id DESC
  `);
  return result.rows.map(mapMemberRow);
}

export async function listVocClusterMembersForClusters(
  db: Db | Tx,
  input: { clusterIds: string[] },
): Promise<VocClusterMemberRow[]> {
  if (input.clusterIds.length === 0) return [];
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT m.cluster_id, m.voc_id, m.added_by, m.added_at,
           v.display_id, v.title, v.severity, v.reporter_facing_status,
           v.primary_managed_system_id, v.reporter_id, v.archived_at
    FROM voc_cluster.voc_cluster_members m
    JOIN voc.vocs v ON v.id = m.voc_id
    WHERE m.cluster_id = ANY(${sqlUuidArray(input.clusterIds)})
    ORDER BY m.cluster_id, m.added_at DESC, m.voc_id DESC
  `);
  return result.rows.map(mapMemberRow);
}

export async function listSameManagedSystemCandidatePeers(
  db: Db | Tx,
  input: { workspaceId: string; clusterId: string; primaryManagedSystemId: string },
): Promise<SameManagedSystemCandidatePeerRow[]> {
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT v.id AS voc_id, v.display_id, v.title, v.severity, v.reporter_facing_status,
           v.primary_managed_system_id, v.reporter_id, v.archived_at
    FROM voc.vocs v
    WHERE v.workspace_id = ${input.workspaceId}
      AND v.primary_managed_system_id = ${input.primaryManagedSystemId}
      AND v.archived_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM voc_cluster.voc_cluster_members m
        WHERE m.cluster_id = ${input.clusterId}
          AND m.voc_id = v.id
      )
    ORDER BY v.created_at DESC, v.id DESC
  `);
  return result.rows.map(mapCandidatePeerRow);
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
