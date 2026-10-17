import type { RecoveryCategory } from '@fops/shared';
import { sql } from 'drizzle-orm';
import { requireRecoveryCommandLock } from '../../db/recovery-command-lock.js';
import type { Tx } from '../../db/tx.js';
import { recoveryIdentity } from './identity.js';

export type RecoverySubject = {
  type:
    | 'voc'
    | 'finding'
    | 'task'
    | 'permission_request'
    | 'survey'
    | 'task_request'
    | 'voc_cluster'
    | 'survey_response';
  id: string;
};
export type RecoveryTruth = {
  category: RecoveryCategory;
  source_id: string;
  system_id: string | null;
  active: boolean;
  withdrawn: boolean;
};
export type RecoveryRecorder = {
  capture(tx: Tx, workspaceId: string, subjects: RecoverySubject[]): Promise<RecoveryCapture>;
  finish(
    tx: Tx,
    capture: RecoveryCapture,
    actorId: string | null,
    action: string | null,
  ): Promise<void>;
  discover(tx: Tx, workspaceId: string, subjects: RecoverySubject[]): Promise<void>;
};
export type RecoveryCapture = {
  workspaceId: string;
  subjects: RecoverySubject[];
  before: RecoveryTruth[];
};
export type RecoveryTruthReaders = {
  read(tx: Tx, workspaceId: string, subjects: RecoverySubject[]): Promise<RecoveryTruth[]>;
  dependencies(
    tx: Tx,
    workspaceId: string,
    subjects: RecoverySubject[],
  ): Promise<RecoverySubject[]>;
};
export async function lockRecoveryIdentity(tx: Tx, workspaceId: string, token: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}), hashtext(${token}))`);
}
export function createRecoveryRecorder(readers: RecoveryTruthReaders): RecoveryRecorder {
  async function capture(tx: Tx, workspaceId: string, subjects: RecoverySubject[]) {
    await requireRecoveryCommandLock(tx, workspaceId);
    const affected = await readers.dependencies(tx, workspaceId, subjects);
    const expanded = [
      ...new Map([...subjects, ...affected].map((s) => [`${s.type}:${s.id}`, s])).values(),
    ];
    // Derive and lock the complete dependency set before reading authoritative pre-state.
    const initial = await readers.read(tx, workspaceId, expanded);
    const tokens = initial.map((r) => recoveryIdentity(r.category, r.source_id)).sort();
    for (const token of tokens) await lockRecoveryIdentity(tx, workspaceId, token);
    return {
      workspaceId,
      subjects: expanded,
      before: await readers.read(tx, workspaceId, expanded),
    };
  }
  async function apply(
    tx: Tx,
    workspaceId: string,
    truth: RecoveryTruth,
    prior: RecoveryTruth | undefined,
    evidence: 'command' | 'observation',
    actorId: string | null,
    action: string | null,
  ) {
    const token = recoveryIdentity(truth.category, truth.source_id);
    const state = truth.withdrawn ? 'withdrawn' : truth.active ? 'active' : 'resolved';
    const beforeState = prior
      ? prior.withdrawn
        ? 'withdrawn'
        : prior.active
          ? 'active'
          : 'resolved'
      : undefined;
    if (evidence === 'command' && beforeState === state) return;
    // A known active pre-state allows the first genuine repair before discovery.
    const seedActive = state === 'active' || beforeState === 'active';
    if (seedActive)
      await tx.execute(sql`INSERT INTO dashboard.recovery_identities
      (workspace_id,recovery_item_id,category,source_id,managed_system_id,occurrence,state)
      VALUES (${workspaceId}::uuid,${token},${truth.category},${truth.source_id}::uuid,${truth.system_id}::uuid,1,'active')
      ON CONFLICT (workspace_id,recovery_item_id) DO NOTHING`);
    const stored = (
      await tx.execute<{ occurrence: number; state: string }>(sql`SELECT occurrence,state
      FROM dashboard.recovery_identities WHERE workspace_id=${workspaceId}::uuid AND recovery_item_id=${token} FOR UPDATE`)
    ).rows[0];
    if (!stored) return; // Never fabricate a resolved episode for a never-observed gap.
    if (stored.state === state) return;
    if (stored.state === 'active' && state !== 'active') {
      await tx.execute(sql`INSERT INTO dashboard.recovery_history
        (workspace_id,recovery_item_id,occurrence,resolved_at,outcome,evidence,actor_id,action)
        VALUES (${workspaceId}::uuid,${token},${stored.occurrence},clock_timestamp(),${state},${evidence},${actorId}::uuid,${action})
        ON CONFLICT (workspace_id,recovery_item_id,occurrence) DO NOTHING`);
    }
    await tx.execute(sql`UPDATE dashboard.recovery_identities SET state=${state},
      occurrence=occurrence + ${state === 'active' ? 1 : 0},managed_system_id=${truth.system_id}::uuid,observed_at=clock_timestamp()
      WHERE workspace_id=${workspaceId}::uuid AND recovery_item_id=${token}`);
  }
  async function finish(
    tx: Tx,
    captured: RecoveryCapture,
    actorId: string | null,
    action: string | null,
  ) {
    const post = await readers.read(tx, captured.workspaceId, captured.subjects);
    const previous = new Map(
      captured.before.map((r) => [recoveryIdentity(r.category, r.source_id), r]),
    );
    for (const truth of post) {
      const prior = previous.get(recoveryIdentity(truth.category, truth.source_id));
      if (prior && (prior.active !== truth.active || prior.withdrawn !== truth.withdrawn)) {
        // Correct pre-existing projection drift using observation evidence before the real command.
        await apply(tx, captured.workspaceId, prior, undefined, 'observation', null, null);
      }
      await apply(tx, captured.workspaceId, truth, prior, 'command', actorId, action);
    }
  }
  async function discover(tx: Tx, workspaceId: string, subjects: RecoverySubject[]) {
    await requireRecoveryCommandLock(tx, workspaceId);
    // Discovery walks every owner source; dependency expansion belongs to atomic commands.
    const initial = await readers.read(tx, workspaceId, subjects);
    for (const token of [
      ...new Set(initial.map((r) => recoveryIdentity(r.category, r.source_id))),
    ].sort()) {
      await lockRecoveryIdentity(tx, workspaceId, token);
    }
    for (const truth of await readers.read(tx, workspaceId, subjects)) {
      await apply(tx, workspaceId, truth, undefined, 'observation', null, null);
    }
  }
  return { capture, finish, discover };
}
