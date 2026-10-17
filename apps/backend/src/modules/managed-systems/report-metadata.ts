import { sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { sqlUuidArray } from '../../db/sql-arrays.js';

/** Read only referenced authorized classifications, retaining archived metadata. */
export async function readManagedSystemMetadata(db: Db, workspaceId: string, ids: string[]) {
  const result = await db.execute<{ id: string; name: string; archived: boolean }>(sql`
    SELECT id, name, archived_at IS NOT NULL AS archived
    FROM core.managed_systems WHERE workspace_id = ${workspaceId}::uuid AND id = ANY(${sqlUuidArray(ids)})
  `);
  return result.rows;
}
