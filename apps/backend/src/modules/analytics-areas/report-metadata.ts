import { sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { sqlUuidArray } from '../../db/sql-arrays.js';

/** Read only referenced authorized classifications, retaining archived metadata. */
export async function readAnalyticsAreaMetadata(db: Db, workspaceId: string, ids: string[]) {
  const result = await db.execute<{
    id: string;
    name: string;
    archived: boolean;
    managed_system_id: string;
  }>(sql`
    SELECT id, name, archived_at IS NOT NULL AS archived, managed_system_id
    FROM core.analytics_areas WHERE workspace_id = ${workspaceId}::uuid AND id = ANY(${sqlUuidArray(ids)})
  `);
  return result.rows;
}
