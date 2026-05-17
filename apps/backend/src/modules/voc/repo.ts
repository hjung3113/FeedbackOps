// apps/backend/src/modules/voc/repo.ts
// Slim repo layer for the VOC module. Owns reads/writes on voc.vocs only —
// other voc.* tables stay behind their own repos. Mirrors the AA module
// shape so callers can be reviewed against the same template.

import { sql } from 'drizzle-orm';

import { analyticsAreas, managedSystems } from '../../db/schema/core.js';
import { vocs } from '../../db/schema/voc.js';
import type { Tx } from '../../db/tx.js';

export interface LockedManagedSystem {
  id: string;
  workspace_id: string;
  archived_at: Date | null;
}

export interface LockedAnalyticsArea {
  id: string;
  workspace_id: string;
  managed_system_id: string;
  archived_at: Date | null;
}

export async function lockManagedSystem(
  tx: Tx,
  workspaceId: string,
  managedSystemId: string,
): Promise<LockedManagedSystem | null> {
  const rows = await tx.execute<{
    id: string;
    workspace_id: string;
    archived_at: Date | null;
  }>(sql`
    select id, workspace_id, archived_at
    from ${managedSystems}
    where id = ${managedSystemId}
      and workspace_id = ${workspaceId}
    for update
  `);
  const row = rows.rows[0];
  return row
    ? { id: row.id, workspace_id: row.workspace_id, archived_at: row.archived_at }
    : null;
}

export async function lockAnalyticsArea(
  tx: Tx,
  workspaceId: string,
  analyticsAreaId: string,
): Promise<LockedAnalyticsArea | null> {
  const rows = await tx.execute<{
    id: string;
    workspace_id: string;
    managed_system_id: string;
    archived_at: Date | null;
  }>(sql`
    select id, workspace_id, managed_system_id, archived_at
    from ${analyticsAreas}
    where id = ${analyticsAreaId}
      and workspace_id = ${workspaceId}
    for update
  `);
  const row = rows.rows[0];
  return row
    ? {
        id: row.id,
        workspace_id: row.workspace_id,
        managed_system_id: row.managed_system_id,
        archived_at: row.archived_at,
      }
    : null;
}

export interface InsertVocInput {
  workspaceId: string;
  primaryManagedSystemId: string;
  analyticsAreaId: string | null;
  reporterId: string;
  title: string;
  descriptionRichContent: unknown;
  sourceContext: string;
}

export async function insertVoc(tx: Tx, input: InsertVocInput) {
  // next_voc_display_id is a SECURITY DEFINER function from migration 0010
  // (#12). It assigns the next VOC-#### slug for the workspace under an
  // advisory lock; we obtain it before the INSERT to keep the SQL surface
  // small (one round trip is fine in a transaction).
  const displayRows = await tx.execute<{ next_voc_display_id: string }>(sql`
    select voc.next_voc_display_id(${input.workspaceId}) as next_voc_display_id
  `);
  const displayId = displayRows.rows[0]?.next_voc_display_id;
  if (!displayId) {
    throw new Error('next_voc_display_id returned empty');
  }

  const inserted = await tx
    .insert(vocs)
    .values({
      workspaceId: input.workspaceId,
      displayId,
      primaryManagedSystemId: input.primaryManagedSystemId,
      analyticsAreaId: input.analyticsAreaId,
      reporterId: input.reporterId,
      title: input.title,
      descriptionRichContent: input.descriptionRichContent as object,
      sourceContext: input.sourceContext,
      // defaults handle: severity=null, reporterFacingStatus='received',
      // triageState='untriaged', ownerUserId=null, ownerTeamId=null
    })
    .returning();
  return inserted[0];
}
