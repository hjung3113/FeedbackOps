import { sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import { vocs } from '../../db/schema/voc.js';
import type { Tx } from '../../db/tx.js';

export interface LinkEndpointRow {
  workspace_id: string;
  managed_system_id: string;
}

export interface EntityLinkRow {
  id: string;
  workspace_id: string;
  source_type: 'voc';
  source_id: string;
  target_type: 'voc';
  target_id: string;
  relation_type: 'related_to';
  visibility: 'internal_only' | 'summary_visible' | 'visible_to_reporter' | 'admin_only';
  status: 'active' | 'stale' | 'detached' | 'revoked';
  managed_system_id: string;
  created_by: string;
  created_at: Date;
  updated_at: Date | null;
  detached_by: string | null;
  detach_reason: string | null;
  detached_at: Date | null;
}

function mapEntityLinkRow(row: Record<string, unknown>): EntityLinkRow {
  return {
    id: row.id as string,
    workspace_id: row.workspace_id as string,
    source_type: row.source_type as 'voc',
    source_id: row.source_id as string,
    target_type: row.target_type as 'voc',
    target_id: row.target_id as string,
    relation_type: row.relation_type as 'related_to',
    visibility: row.visibility as EntityLinkRow['visibility'],
    status: row.status as EntityLinkRow['status'],
    managed_system_id: row.managed_system_id as string,
    created_by: row.created_by as string,
    created_at:
      row.created_at instanceof Date ? row.created_at : new Date(row.created_at as string),
    updated_at:
      row.updated_at === null || row.updated_at === undefined
        ? null
        : row.updated_at instanceof Date
          ? row.updated_at
          : new Date(row.updated_at as string),
    detached_by: (row.detached_by as string | null) ?? null,
    detach_reason: (row.detach_reason as string | null) ?? null,
    detached_at:
      row.detached_at === null || row.detached_at === undefined
        ? null
        : row.detached_at instanceof Date
          ? row.detached_at
          : new Date(row.detached_at as string),
  };
}

export async function resolveVocEndpoint(
  db: Db | Tx,
  workspaceId: string,
  vocId: string,
): Promise<LinkEndpointRow | null> {
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT workspace_id, primary_managed_system_id AS managed_system_id
    FROM ${vocs}
    WHERE id = ${vocId}
      AND workspace_id = ${workspaceId}
      AND archived_at IS NULL
  `);
  const row = result.rows[0];
  if (!row) return null;
  return {
    workspace_id: row.workspace_id as string,
    managed_system_id: row.managed_system_id as string,
  };
}

export async function insertActiveVocRelatedToLink(
  tx: Tx,
  input: {
    workspaceId: string;
    sourceId: string;
    targetId: string;
    managedSystemId: string;
    createdBy: string;
    visibility: 'internal_only';
  },
): Promise<{ row: EntityLinkRow; inserted: boolean }> {
  const inserted = await (tx as Db).execute<Record<string, unknown>>(sql`
    INSERT INTO core.entity_links (
      workspace_id, source_type, source_id, target_type, target_id,
      relation_type, visibility, status, managed_system_id, created_by
    )
    VALUES (
      ${input.workspaceId}, 'voc', ${input.sourceId}, 'voc', ${input.targetId},
      'related_to', ${input.visibility}, 'active', ${input.managedSystemId}, ${input.createdBy}
    )
    ON CONFLICT (
      workspace_id, source_type, source_id, target_type, target_id, relation_type
    ) WHERE status = 'active'
    DO NOTHING
    RETURNING
      id, workspace_id, source_type, source_id, target_type, target_id,
      relation_type, visibility, status, managed_system_id, created_by,
      created_at, updated_at, detached_by, detach_reason, detached_at
  `);
  const insertedRow = inserted.rows[0];
  if (insertedRow) return { row: mapEntityLinkRow(insertedRow), inserted: true };

  const existing = await selectActiveVocRelatedToLink(tx, {
    workspaceId: input.workspaceId,
    sourceId: input.sourceId,
    targetId: input.targetId,
  });
  if (!existing) {
    throw new Error('entity link conflict did not return existing active row');
  }
  return { row: existing, inserted: false };
}

export async function selectActiveVocRelatedToLink(
  db: Db | Tx,
  input: { workspaceId: string; sourceId: string; targetId: string },
): Promise<EntityLinkRow | null> {
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT
      id, workspace_id, source_type, source_id, target_type, target_id,
      relation_type, visibility, status, managed_system_id, created_by,
      created_at, updated_at, detached_by, detach_reason, detached_at
    FROM core.entity_links
    WHERE workspace_id = ${input.workspaceId}
      AND source_type = 'voc'
      AND source_id = ${input.sourceId}
      AND target_type = 'voc'
      AND target_id = ${input.targetId}
      AND relation_type = 'related_to'
      AND status = 'active'
    LIMIT 1
  `);
  const row = result.rows[0];
  return row ? mapEntityLinkRow(row) : null;
}

export async function selectActiveLinksForEndpoint(
  db: Db | Tx,
  input: {
    workspaceId: string;
    endpointType: 'voc';
    endpointId: string;
    side?: 'source' | 'target';
  },
): Promise<EntityLinkRow[]> {
  const sidePredicate =
    input.side === 'source'
      ? sql`source_type = ${input.endpointType} AND source_id = ${input.endpointId}`
      : input.side === 'target'
        ? sql`target_type = ${input.endpointType} AND target_id = ${input.endpointId}`
        : sql`(
            (source_type = ${input.endpointType} AND source_id = ${input.endpointId})
            OR (target_type = ${input.endpointType} AND target_id = ${input.endpointId})
          )`;

  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT
      id, workspace_id, source_type, source_id, target_type, target_id,
      relation_type, visibility, status, managed_system_id, created_by,
      created_at, updated_at, detached_by, detach_reason, detached_at
    FROM core.entity_links
    WHERE workspace_id = ${input.workspaceId}
      AND status = 'active'
      AND ${sidePredicate}
    ORDER BY created_at DESC, id DESC
  `);
  return result.rows.map(mapEntityLinkRow);
}

export async function selectLinksByWorkspace(
  db: Db | Tx,
  input: {
    workspaceId: string;
    statuses?: EntityLinkRow['status'][];
    relationType?: EntityLinkRow['relation_type'];
    managedSystemId?: string;
  },
): Promise<EntityLinkRow[]> {
  const predicates = [sql`workspace_id = ${input.workspaceId}`];
  if (input.statuses !== undefined && input.statuses.length > 0) {
    predicates.push(sql`status::text = ANY(${input.statuses})`);
  }
  if (input.relationType !== undefined) {
    predicates.push(sql`relation_type = ${input.relationType}`);
  }
  if (input.managedSystemId !== undefined) {
    predicates.push(sql`managed_system_id = ${input.managedSystemId}`);
  }

  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT
      id, workspace_id, source_type, source_id, target_type, target_id,
      relation_type, visibility, status, managed_system_id, created_by,
      created_at, updated_at, detached_by, detach_reason, detached_at
    FROM core.entity_links
    WHERE ${sql.join(predicates, sql` AND `)}
    ORDER BY created_at DESC, id DESC
  `);
  return result.rows.map(mapEntityLinkRow);
}

export async function selectEntityLinkById(
  db: Db | Tx,
  input: { workspaceId: string; linkId: string },
): Promise<EntityLinkRow | null> {
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT
      id, workspace_id, source_type, source_id, target_type, target_id,
      relation_type, visibility, status, managed_system_id, created_by,
      created_at, updated_at, detached_by, detach_reason, detached_at
    FROM core.entity_links
    WHERE workspace_id = ${input.workspaceId}
      AND id = ${input.linkId}
    LIMIT 1
  `);
  const row = result.rows[0];
  return row ? mapEntityLinkRow(row) : null;
}

export async function detachVocRelatedToLink(
  tx: Tx,
  input: {
    workspaceId: string;
    linkId: string;
    actorId: string;
    reason: string;
  },
): Promise<EntityLinkRow | null> {
  const updated = await (tx as Db).execute<Record<string, unknown>>(sql`
    UPDATE core.entity_links
    SET
      status = 'detached',
      detached_by = ${input.actorId},
      detach_reason = ${input.reason},
      detached_at = now(),
      updated_at = now()
    WHERE workspace_id = ${input.workspaceId}
      AND id = ${input.linkId}
      AND status = 'active'
    RETURNING
      id, workspace_id, source_type, source_id, target_type, target_id,
      relation_type, visibility, status, managed_system_id, created_by,
      created_at, updated_at, detached_by, detach_reason, detached_at
  `);
  const row = updated.rows[0];
  return row ? mapEntityLinkRow(row) : null;
}
