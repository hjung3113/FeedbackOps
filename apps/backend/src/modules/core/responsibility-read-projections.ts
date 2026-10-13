import { and, eq } from 'drizzle-orm';
import { teams } from '../../db/schema/core.js';
import type { Tx } from '../../db/tx.js';

/** Core-owned validity input in the caller transaction. Teams have SELECT-only app grants. */
export async function findResponsibilityTeam(tx: Tx, workspaceId: string, teamId: string) {
  const [team] = await tx
    .select({ id: teams.id, archived_at: teams.archivedAt })
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.workspaceId, workspaceId)))
    .limit(1);
  return team ?? null;
}
