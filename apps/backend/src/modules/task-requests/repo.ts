import { sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';

export interface TaskRequestRow {
  id: string;
  workspace_id: string;
  source_type: 'finding' | 'voc' | 'voc_cluster';
  source_id: string;
  primary_managed_system_id: string;
  evidence_summary: string;
  requested_outcome: string;
  requester_actor_id: string;
  status: 'pending_review' | 'approved' | 'rejected' | 'needs_more_evidence' | 'converted';
  created_at: Date;
  updated_at: Date;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function mapTaskRequestRow(row: Record<string, unknown>): TaskRequestRow {
  return {
    id: row.id as string,
    workspace_id: row.workspace_id as string,
    source_type: row.source_type as TaskRequestRow['source_type'],
    source_id: row.source_id as string,
    primary_managed_system_id: row.primary_managed_system_id as string,
    evidence_summary: row.evidence_summary as string,
    requested_outcome: row.requested_outcome as string,
    requester_actor_id: row.requester_actor_id as string,
    status: row.status as TaskRequestRow['status'],
    created_at: toDate(row.created_at as Date | string),
    updated_at: toDate(row.updated_at as Date | string),
  };
}

export async function insertTaskRequest(
  tx: Tx,
  input: {
    workspaceId: string;
    sourceType: 'finding';
    sourceId: string;
    primaryManagedSystemId: string;
    evidenceSummary: string;
    requestedOutcome: string;
    requesterActorId: string;
  },
): Promise<TaskRequestRow> {
  const result = await tx.execute<Record<string, unknown>>(sql`
    INSERT INTO task_request.task_requests (
      workspace_id, source_type, source_id, primary_managed_system_id,
      evidence_summary, requested_outcome, requester_actor_id, status
    )
    VALUES (
      ${input.workspaceId}, ${input.sourceType}, ${input.sourceId},
      ${input.primaryManagedSystemId}, ${input.evidenceSummary},
      ${input.requestedOutcome}, ${input.requesterActorId}, 'pending_review'
    )
    RETURNING
      id, workspace_id, source_type, source_id, primary_managed_system_id,
      evidence_summary, requested_outcome, requester_actor_id, status,
      created_at, updated_at
  `);
  const row = result.rows[0];
  if (!row) throw new Error('insertTaskRequest returned no row');
  return mapTaskRequestRow(row);
}

export async function findTaskRequestById(
  db: Db | Tx,
  input: { workspaceId: string; taskRequestId: string },
): Promise<TaskRequestRow | null> {
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT
      id, workspace_id, source_type, source_id, primary_managed_system_id,
      evidence_summary, requested_outcome, requester_actor_id, status,
      created_at, updated_at
    FROM task_request.task_requests
    WHERE id = ${input.taskRequestId}
      AND workspace_id = ${input.workspaceId}
    LIMIT 1
  `);
  const row = result.rows[0];
  return row ? mapTaskRequestRow(row) : null;
}
