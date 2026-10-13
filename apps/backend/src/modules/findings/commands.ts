import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import { assertActiveAnalyticsAreaForManagedSystem } from '../analytics-areas/index.js';
import { lockManagedSystem } from '../managed-systems/index.js';
import type { CheckService } from '../permissions/check-service.js';
import type { FindingReadRow } from './repo-read.js';
import { insertFinding, lockFindingById, updateFindingLinkedTask } from './repo.js';
import { resolveOwner } from './responsibility.js';

/**
 * Application seam for cross-module Finding commands (#391). Findings owns the
 * `finding.*` tables; other modules call these commands instead of importing
 * ./repo.js directly.
 */

export interface CreateFindingFromVocClusterInput {
  owner_actor_id?: string | null | undefined;
  owner_team_id?: string | null | undefined;
  workspaceId: string;
  primaryManagedSystemId: string;
  title: string;
  summary: string;
  sourceId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: 'low' | 'medium' | 'high' | null;
  analyticsAreaId: string | null;
  createdBy: string;
}

export async function createFindingFromVocCluster(
  tx: Tx,
  input: CreateFindingFromVocClusterInput,
  deps: { checkService: CheckService },
) {
  const ms = await lockManagedSystem(tx, input.workspaceId, input.primaryManagedSystemId);
  if (!ms) throw new HttpError('not_found.record', 'managed system not found');
  if (ms.archived_at) throw new HttpError('conflict.parent_archived', 'managed system archived');
  const area = input.analyticsAreaId
    ? await assertActiveAnalyticsAreaForManagedSystem(
        tx,
        input.workspaceId,
        ms.id,
        input.analyticsAreaId,
      )
    : null;
  const owner = await resolveOwner(
    tx,
    deps,
    input.workspaceId,
    ms,
    area?.owner_team_id ?? null,
    input,
  );
  const finding = await insertFinding(tx, {
    ...input,
    sourceType: 'voc_cluster',
    ownerActorId: owner.owner_actor_id,
    ownerTeamId: owner.owner_team_id,
  });
  return { ...finding, ...owner };
}

export async function lockFindingForUpdate(
  tx: Tx,
  input: { workspaceId: string; findingId: string },
): Promise<FindingReadRow | null> {
  return lockFindingById(tx, input);
}

/**
 * Locks the finding and sets linked_task_id only while it is still null, so a
 * concurrent linking wins and later callers observe the existing link. Returns
 * the row as it stands after the call (updated when it linked, else the
 * existing row); null when the finding does not exist.
 */
export async function linkTaskToFinding(
  tx: Tx,
  input: { workspaceId: string; findingId: string; taskId: string },
): Promise<FindingReadRow | null> {
  const finding = await lockFindingById(tx, {
    workspaceId: input.workspaceId,
    findingId: input.findingId,
  });
  if (finding?.linked_task_id === null) {
    return updateFindingLinkedTask(tx, {
      workspaceId: input.workspaceId,
      findingId: finding.id,
      taskId: input.taskId,
    });
  }
  return finding;
}
