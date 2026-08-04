import { sql } from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import { type Scope, similarVocVisibilityPredicate } from '../repo-read.js';

export interface PreSubmitVocPeerRow extends Record<string, unknown> {
  id: string;
  display_id: string;
  title: string;
  /** `db.execute` returns timestamptz as postgres text, not a Date. */
  created_at: Date | string;
}

export async function selectPreSubmitVocPeers(
  db: Db,
  args: { workspaceId: string; managedSystemId: string; actorId: string; readScope: Scope },
): Promise<PreSubmitVocPeerRow[]> {
  const visible = similarVocVisibilityPredicate(args.readScope, args.actorId, sql`v`);
  const result = await db.execute<PreSubmitVocPeerRow>(sql`
    SELECT v.id, v.display_id, v.title, v.created_at
      FROM voc.vocs v
     WHERE v.workspace_id = ${args.workspaceId}
       AND v.primary_managed_system_id = ${args.managedSystemId}
       AND v.archived_at IS NULL
       AND ${visible}
     ORDER BY v.created_at DESC, v.id DESC
     LIMIT 3
  `);
  return result.rows;
}
