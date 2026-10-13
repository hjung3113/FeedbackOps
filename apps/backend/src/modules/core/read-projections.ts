import { and, eq } from 'drizzle-orm';
import { teams } from '../../db/schema/core.js';
import type { Tx } from '../../db/tx.js';

/** Core-owned routing input; destinations decide eligibility and assignment. */
export async function readResponsibilityTeam(tx: Tx, workspaceId: string, teamId: string) {
  const [team] = await tx
    .select({ id: teams.id, archived_at: teams.archivedAt })
    .from(teams)
    .where(and(eq(teams.workspaceId, workspaceId), eq(teams.id, teamId)));
  return team ?? null;
}
