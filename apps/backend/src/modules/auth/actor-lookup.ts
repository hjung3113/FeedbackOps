// Workspace-scoped actor-by-id lookup (#514 A7).
//
// Auth owns the actor identity surface (see list-actors-routes.ts header), so
// the core.actors SELECT lives here. Modules that must validate an
// owner/assignee id import this through '../auth/index.js' — never a repo,
// and never their own copy of the SQL.

import { and, eq } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import { actors } from '../../db/schema/core.js';
import type { Tx } from '../../db/tx.js';

export interface WorkspaceActor {
  id: string;
  role_level: 'admin' | 'developer' | 'user';
}

export async function findWorkspaceActor(
  db: Db | Tx,
  input: { workspaceId: string; actorId: string },
): Promise<WorkspaceActor | null> {
  const rows = await db
    .select({ id: actors.id, role_level: actors.roleLevel })
    .from(actors)
    .where(and(eq(actors.workspaceId, input.workspaceId), eq(actors.id, input.actorId)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.role_level !== 'admin' && row.role_level !== 'developer' && row.role_level !== 'user') {
    throw new Error(`unexpected role_level for actor ${row.id}: ${row.role_level}`);
  }
  return { id: row.id, role_level: row.role_level };
}
