import { sql } from 'drizzle-orm';

import { managedSystems } from '../../db/schema/core.js';
import type { Tx } from '../../db/tx.js';

export interface LockedManagedSystem {
  id: string;
  workspace_id: string;
  archived_at: Date | null;
  default_survey_operator_actor_id: string | null;
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
  }>(sql`
    select id, workspace_id, archived_at, default_survey_operator_actor_id
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
      }
    : null;
}
