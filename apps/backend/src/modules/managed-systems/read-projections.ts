import { sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import { managedSystems } from '../../db/schema/core.js';

/** Non-archived managed system ids for a workspace. */
export async function allManagedSystemIds(
  db: Db | Tx,
  workspaceId: string,
): Promise<string[]> {
  const rows = await (db as Db)
    .select({ id: managedSystems.id })
    .from(managedSystems)
    .where(
      sql`${managedSystems.workspaceId} = ${workspaceId} AND ${managedSystems.archivedAt} IS NULL`,
    );
  return rows.map((r) => r.id);
}
