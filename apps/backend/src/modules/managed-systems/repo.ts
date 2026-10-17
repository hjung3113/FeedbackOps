import { sql } from 'drizzle-orm';

import { managedSystems } from '../../db/schema/core.js';
import type { Tx } from '../../db/tx.js';

export interface LockedManagedSystem {
  id: string;
  workspace_id: string;
  archived_at: Date | null;
  default_survey_operator_actor_id: string | null;
  default_owner_actor_id: string | null;
  default_owner_team_id: string | null;
  default_reviewer_actor_id: string | null;
  default_reviewer_team_id: string | null;
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
    default_survey_operator_actor_id: string | null;
    default_owner_actor_id: string | null;
    default_owner_team_id: string | null;
    default_reviewer_actor_id: string | null;
    default_reviewer_team_id: string | null;
  }>(sql`
    select id, workspace_id, archived_at, default_survey_operator_actor_id,
      default_owner_actor_id, default_owner_team_id, default_reviewer_actor_id, default_reviewer_team_id
    from ${managedSystems}
    where id = ${managedSystemId}
      and workspace_id = ${workspaceId}
    for update
  `);
  const row = rows.rows[0];
  return row
    ? {
        id: row.id,
        workspace_id: row.workspace_id,
        archived_at: row.archived_at,
        default_survey_operator_actor_id: row.default_survey_operator_actor_id,
        default_owner_actor_id: row.default_owner_actor_id,
        default_owner_team_id: row.default_owner_team_id,
        default_reviewer_actor_id: row.default_reviewer_actor_id,
        default_reviewer_team_id: row.default_reviewer_team_id,
      }
    : null;
}

/** Active-parent validation projection only; confers no VOC read scope. */
export async function readManagedSystemState(
  db: Tx,
  workspaceId: string,
  managedSystemId: string,
): Promise<{ id: string; archived_at: Date | null } | null> {
  const result = await db.execute<{ id: string; archived_at: Date | null }>(sql`
    SELECT id, archived_at FROM ${managedSystems}
    WHERE workspace_id = ${workspaceId} AND id = ${managedSystemId}
  `);
  return result.rows[0] ?? null;
}
