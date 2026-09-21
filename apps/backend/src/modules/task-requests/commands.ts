import type { Tx } from '../../db/tx.js';
import type { TaskRequestRow } from './repo.js';
import {
  lockTaskRequestById,
  markTaskRequestConverted as markTaskRequestConvertedRepo,
} from './repo.js';

/**
 * Application seam for cross-module Task Request commands (#391). Task
 * Requests owns the `task_request.*` tables; other modules call these
 * commands instead of importing ./repo.js directly.
 */

export type { TaskRequestRow } from './repo.js';

export async function lockTaskRequestForUpdate(
  tx: Tx,
  input: { workspaceId: string; taskRequestId: string },
): Promise<TaskRequestRow | null> {
  return lockTaskRequestById(tx, input);
}

export async function markTaskRequestConverted(
  tx: Tx,
  input: { workspaceId: string; taskRequestId: string },
): Promise<void> {
  return markTaskRequestConvertedRepo(tx, input);
}
