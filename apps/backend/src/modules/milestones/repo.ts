import { sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';

export interface MilestoneRow {
  id: string;
  workspace_id: string;
  display_id: string;
  primary_managed_system_id: string;
  title: string;
  why: string;
  status: string;
  owner_actor_id: string;
  analytics_area_id: string | null;
  start_date: string;
  target_date: string;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

function mapMilestoneRow(row: Record<string, unknown>): MilestoneRow {
  return {
    id: row.id as string,
    workspace_id: row.workspace_id as string,
    display_id: row.display_id as string,
    primary_managed_system_id: row.primary_managed_system_id as string,
    title: row.title as string,
    why: row.why as string,
    status: row.status as string,
    owner_actor_id: row.owner_actor_id as string,
    analytics_area_id: (row.analytics_area_id as string | null) ?? null,
    start_date: (row.start_date as string) ?? '',
    target_date: (row.target_date as string) ?? '',
    created_by: row.created_by as string,
    created_at:
      row.created_at instanceof Date ? row.created_at : new Date(row.created_at as string),
    updated_at:
      row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at as string),
  };
}

const MILESTONE_SELECT = sql`
  id, workspace_id, display_id, primary_managed_system_id, title, why, status,
  owner_actor_id, analytics_area_id, start_date::text AS start_date,
  target_date::text AS target_date, created_by, created_at, updated_at
`;

// Omitted status leaves the column default ('planning'). ADR-0050.
export async function insertMilestone(
  tx: Tx,
  input: {
    workspaceId: string;
    primaryManagedSystemId: string;
    title: string;
    why: string;
    ownerActorId: string;
    analyticsAreaId: string | null;
    startDate: string;
    targetDate: string;
    createdBy: string;
    status?: string;
  },
): Promise<MilestoneRow> {
  const displayRows = await tx.execute<{ v: string }>(sql`
    select core.next_display_id(${input.workspaceId}, 'milestone') as v
  `);
  const displayId = displayRows.rows[0]?.v;
  if (!displayId) {
    throw new Error('next_display_id returned empty');
  }

  const columns = [
    sql`workspace_id`,
    sql`display_id`,
    sql`primary_managed_system_id`,
    sql`title`,
    sql`why`,
    sql`owner_actor_id`,
    sql`analytics_area_id`,
    sql`start_date`,
    sql`target_date`,
    sql`created_by`,
  ];
  const values = [
    sql`${input.workspaceId}`,
    sql`${displayId}`,
    sql`${input.primaryManagedSystemId}`,
    sql`${input.title}`,
    sql`${input.why}`,
    sql`${input.ownerActorId}`,
    sql`${input.analyticsAreaId}`,
    sql`${input.startDate}`,
    sql`${input.targetDate}`,
    sql`${input.createdBy}`,
  ];
  if (input.status !== undefined) {
    columns.push(sql`status`);
    values.push(sql`${input.status}`);
  }
  const result = await tx.execute<Record<string, unknown>>(sql`
    INSERT INTO task.milestones (${sql.join(columns, sql`, `)})
    VALUES (${sql.join(values, sql`, `)})
    RETURNING ${MILESTONE_SELECT}
  `);
  const row = result.rows[0];
  if (!row) throw new Error('insertMilestone returned no row');
  return mapMilestoneRow(row);
}

export async function listMilestonesByWorkspace(
  db: Db | Tx,
  input: {
    workspaceId: string;
    managedSystemId?: string;
    status?: string;
  },
): Promise<MilestoneRow[]> {
  const predicates = [sql`workspace_id = ${input.workspaceId}`];
  if (input.status !== undefined) predicates.push(sql`status = ${input.status}`);
  if (input.managedSystemId !== undefined) {
    predicates.push(sql`primary_managed_system_id = ${input.managedSystemId}`);
  }
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT ${MILESTONE_SELECT}
      FROM task.milestones
     WHERE ${sql.join(predicates, sql` AND `)}
     ORDER BY created_at DESC, id DESC
  `);
  return result.rows.map(mapMilestoneRow);
}

export async function findMilestoneById(
  db: Db | Tx,
  input: { workspaceId: string; milestoneId: string },
): Promise<MilestoneRow | null> {
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT ${MILESTONE_SELECT}
      FROM task.milestones
     WHERE id = ${input.milestoneId}
       AND workspace_id = ${input.workspaceId}
     LIMIT 1
  `);
  const row = result.rows[0];
  return row ? mapMilestoneRow(row) : null;
}

/** Full-row lock for PATCH; A4's narrow lockMilestone stays the cross-module seam. */
export async function lockMilestoneForUpdate(
  tx: Tx,
  input: { workspaceId: string; milestoneId: string },
): Promise<MilestoneRow | null> {
  const result = await tx.execute<Record<string, unknown>>(sql`
    SELECT ${MILESTONE_SELECT}
      FROM task.milestones
     WHERE id = ${input.milestoneId}
       AND workspace_id = ${input.workspaceId}
     FOR UPDATE
     LIMIT 1
  `);
  const row = result.rows[0];
  return row ? mapMilestoneRow(row) : null;
}

// primary_managed_system_id stays off this type (A8). status is ADR-0050.
export async function updateMilestone(
  tx: Tx,
  input: {
    workspaceId: string;
    milestoneId: string;
    patch: {
      title?: string;
      why?: string;
      ownerActorId?: string;
      analyticsAreaId?: string | null;
      startDate?: string;
      targetDate?: string;
      status?: string;
    };
  },
): Promise<MilestoneRow> {
  const sets = [sql`updated_at = now()`];
  if (input.patch.title !== undefined) sets.push(sql`title = ${input.patch.title}`);
  if (input.patch.why !== undefined) sets.push(sql`why = ${input.patch.why}`);
  if (input.patch.ownerActorId !== undefined) {
    sets.push(sql`owner_actor_id = ${input.patch.ownerActorId}`);
  }
  if (input.patch.analyticsAreaId !== undefined) {
    sets.push(sql`analytics_area_id = ${input.patch.analyticsAreaId}`);
  }
  if (input.patch.startDate !== undefined) sets.push(sql`start_date = ${input.patch.startDate}`);
  if (input.patch.targetDate !== undefined) sets.push(sql`target_date = ${input.patch.targetDate}`);
  if (input.patch.status !== undefined) sets.push(sql`status = ${input.patch.status}`);
  const result = await tx.execute<Record<string, unknown>>(sql`
    UPDATE task.milestones
       SET ${sql.join(sets, sql`, `)}
     WHERE id = ${input.milestoneId}
       AND workspace_id = ${input.workspaceId}
     RETURNING ${MILESTONE_SELECT}
  `);
  const row = result.rows[0];
  if (!row) throw new Error('updateMilestone returned no row');
  return mapMilestoneRow(row);
}

/** Lock a workspace-scoped Milestone for update. No status policy (#514 G-status). */
export async function lockMilestone(
  db: Db | Tx,
  input: { workspaceId: string; milestoneId: string },
): Promise<Pick<
  MilestoneRow,
  'id' | 'workspace_id' | 'primary_managed_system_id' | 'status'
> | null> {
  const result = await db.execute<Record<string, unknown>>(sql`
    SELECT id, workspace_id, primary_managed_system_id, status
      FROM task.milestones
     WHERE id = ${input.milestoneId}
       AND workspace_id = ${input.workspaceId}
     FOR UPDATE
     LIMIT 1
  `);
  const row = result.rows[0];
  return row
    ? {
        id: row.id as string,
        workspace_id: row.workspace_id as string,
        primary_managed_system_id: row.primary_managed_system_id as string,
        status: row.status as string,
      }
    : null;
}
