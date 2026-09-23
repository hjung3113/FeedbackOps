import { sql } from 'drizzle-orm';

import { analyticsAreas } from '../../db/schema/core.js';
import type { Tx } from '../../db/tx.js';

export interface LockedAnalyticsArea {
  id: string;
  workspace_id: string;
  managed_system_id: string;
  archived_at: Date | null;
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
