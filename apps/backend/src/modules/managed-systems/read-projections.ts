import { sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import { managedSystems } from '../../db/schema/core.js';
import type { Tx } from '../../db/tx.js';

/** Non-archived managed system ids for a workspace. */
export async function allManagedSystemIds(db: Db | Tx, workspaceId: string): Promise<string[]> {
  const rows = await (db as Db)
    .select({ id: managedSystems.id })
    .from(managedSystems)
    .where(
      sql`${managedSystems.workspaceId} = ${workspaceId} AND ${managedSystems.archivedAt} IS NULL`,
    );
  return rows.map((r) => r.id);
}

/** Whether a Managed System exists in a workspace, including archived systems. */
export async function managedSystemExists(
  db: Db | Tx,
  workspaceId: string,
  managedSystemId: string,
): Promise<boolean> {
  const rows = await (db as Db)
    .select({ id: managedSystems.id })
    .from(managedSystems)
    .where(
      sql`${managedSystems.id} = ${managedSystemId} AND ${managedSystems.workspaceId} = ${workspaceId}`,
    )
    .limit(1);
  return rows.length > 0;
}

/** Managed System id/workspace pairs, including archived systems. */
export async function allManagedSystemWorkspacePairs(
  db: Db | Tx,
): Promise<Array<{ id: string; workspace_id: string }>> {
  return (db as Db)
    .select({ id: managedSystems.id, workspace_id: managedSystems.workspaceId })
    .from(managedSystems);
}
