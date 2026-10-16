import type { VocFollowUpState } from '@fops/shared';
import { and, eq, sql } from 'drizzle-orm';
import { vocNoFollowUpDecisions, vocs } from '../../db/schema/voc.js';
import type { Tx } from '../../db/tx.js';
import { managedSystemIsLiveSql } from '../managed-systems/read-projections.js';
import { vocFollowUpRootsSql } from './read-projections.js';

/** VOC-owned state projection; reveals no linked target identities. */
export async function readVocFollowUpState(
  db: Tx,
  workspaceId: string,
  vocId: string,
  canTriage: boolean,
): Promise<VocFollowUpState> {
  const result = await db.execute<{
    linked: boolean;
    eligible: boolean;
    writable: boolean;
  }>(sql`SELECT EXISTS (${vocFollowUpRootsSql(workspaceId, sql`${vocs.id}`)}) AS linked,
    (${vocs.archivedAt} IS NULL AND ${vocs.severity} IN ('high','critical')
      AND ${managedSystemIsLiveSql(vocs.primaryManagedSystemId)}) AS eligible,
    (${vocs.archivedAt} IS NULL AND ${managedSystemIsLiveSql(vocs.primaryManagedSystemId)}) AS writable
    FROM ${vocs} WHERE ${vocs.workspaceId}=${workspaceId}::uuid AND ${vocs.id}=${vocId}::uuid`);
  const current = (
    await db
      .select()
      .from(vocNoFollowUpDecisions)
      .where(
        and(
          eq(vocNoFollowUpDecisions.workspaceId, workspaceId),
          eq(vocNoFollowUpDecisions.vocId, vocId),
          sql`${vocNoFollowUpDecisions.withdrawnAt} IS NULL`,
        ),
      )
  )[0];
  const state = result.rows[0];
  return {
    decision: current
      ? {
          decision: 'no_follow_up',
          reason: current.reason,
          actor_id: current.decidedByActorId,
          decided_at: current.decidedAt.toISOString(),
        }
      : null,
    can_record: canTriage && state?.eligible === true && !state.linked && !current,
    // Withdrawal remains allowed after severity/link changes, but never on archived parents.
    can_withdraw: canTriage && !!current && state?.writable === true,
  };
}

export async function recordVocNoFollowUp(
  db: Tx,
  workspaceId: string,
  vocId: string,
  actorId: string,
  reason: string,
) {
  await db
    .insert(vocNoFollowUpDecisions)
    .values({
      workspaceId,
      vocId,
      decision: 'no_follow_up',
      reason,
      decidedByActorId: actorId,
    })
    .onConflictDoUpdate({
      target: [vocNoFollowUpDecisions.workspaceId, vocNoFollowUpDecisions.vocId],
      set: {
        decision: 'no_follow_up',
        reason,
        decidedByActorId: actorId,
        decidedAt: sql`now()`,
        updatedAt: sql`now()`,
        withdrawnAt: null,
      },
    });
}

export async function withdrawVocNoFollowUp(db: Tx, workspaceId: string, vocId: string) {
  await db
    .update(vocNoFollowUpDecisions)
    .set({ withdrawnAt: sql`now()`, updatedAt: sql`now()` })
    .where(
      and(
        eq(vocNoFollowUpDecisions.workspaceId, workspaceId),
        eq(vocNoFollowUpDecisions.vocId, vocId),
      ),
    );
}
