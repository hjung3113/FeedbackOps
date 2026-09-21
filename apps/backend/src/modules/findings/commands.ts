import type { Tx } from '../../db/tx.js';
import type { FindingReadRow } from './repo-read.js';
import { insertFinding, lockFindingById, updateFindingLinkedTask } from './repo.js';

/**
 * Application seam for cross-module Finding commands (#391). Findings owns the
 * `finding.*` tables; other modules call these commands instead of importing
 * ./repo.js directly.
 */

export interface CreateFindingFromVocClusterInput {
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
): Promise<FindingReadRow> {
  return insertFinding(tx, { ...input, sourceType: 'voc_cluster' });
}

export async function lockFindingForUpdate(
  tx: Tx,
  input: { workspaceId: string; findingId: string },
): Promise<FindingReadRow | null> {
  return lockFindingById(tx, input);
}

/**
 * Locks the finding and sets linked_task_id only while it is still null, so a
 * concurrent linking wins and later callers observe the existing link.
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
    await updateFindingLinkedTask(tx, {
      workspaceId: input.workspaceId,
      findingId: finding.id,
      taskId: input.taskId,
    });
  }
  return finding;
}
