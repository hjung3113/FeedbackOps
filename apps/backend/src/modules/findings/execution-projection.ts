import type { Tx } from '../../db/tx.js';
import { selectActiveLinksForEndpoint } from '../entity-links/commands.js';
import { lockFindingById, updateFindingLinkedTask } from './repo.js';

export type FindingExecutionReconciler = (
  tx: Tx,
  input: { workspaceId: string; findingId: string },
) => Promise<void>;

export async function activeFindingTaskLinks(
  tx: Tx,
  input: { workspaceId: string; findingId: string },
) {
  const links = await selectActiveLinksForEndpoint(tx, {
    workspaceId: input.workspaceId,
    endpointType: 'finding',
    endpointId: input.findingId,
    side: 'source',
  });
  return links.filter(
    (link) => link.target_type === 'task' && link.relation_type === 'requested_task',
  );
}

/** Caller holds the workspace recovery lock; Findings alone writes its projection. */
export const reconcileFindingExecution: FindingExecutionReconciler = async (tx, input) => {
  const finding = await lockFindingById(tx, input);
  if (!finding || finding.linked_task_id === null) return;
  if ((await activeFindingTaskLinks(tx, input)).length === 0) {
    await updateFindingLinkedTask(tx, { ...input, taskId: null });
  }
};
