import { sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';

export interface TaskRequestRow {
  id: string;
  workspace_id: string;
  display_id: string;
  source_type: 'finding' | 'voc' | 'voc_cluster';
  source_id: string;
  primary_managed_system_id: string;
  evidence_summary: string;
  requested_outcome: string;
  requester_actor_id: string;
  status: 'pending_review' | 'approved' | 'rejected' | 'needs_more_evidence' | 'converted';
  reviewer_actor_id: string | null;
  decision_reason: string | null;
  decided_at: Date | null;
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
    display_id: row.display_id as string,
    source_type: row.source_type as TaskRequestRow['source_type'],
    source_id: row.source_id as string,
    primary_managed_system_id: row.primary_managed_system_id as string,
    evidence_summary: row.evidence_summary as string,
    requested_outcome: row.requested_outcome as string,
    requester_actor_id: row.requester_actor_id as string,
    status: row.status as TaskRequestRow['status'],
    reviewer_actor_id: (row.reviewer_actor_id as string | null) ?? null,
    decision_reason: (row.decision_reason as string | null) ?? null,
    decided_at:
      row.decided_at === null || row.decided_at === undefined
        ? null
        : toDate(row.decided_at as Date | string),
    created_at: toDate(row.created_at as Date | string),
    updated_at: toDate(row.updated_at as Date | string),
  };
}

export async function insertTaskRequest(
  tx: Tx,
  input: {
    workspaceId: string;
    sourceType: TaskRequestRow['source_type'];
    sourceId: string;
    primaryManagedSystemId: string;
    evidenceSummary: string;
    requestedOutcome: string;
    requesterActorId: string;
  },
): Promise<TaskRequestRow> {
  const displayRows = await tx.execute<{ v: string }>(sql`
    select core.next_display_id(${input.workspaceId}, 'task_request') as v
  `);
  const displayId = displayRows.rows[0]?.v;
  if (!displayId) {
    throw new Error('next_display_id returned empty');
  }

  const result = await tx.execute<Record<string, unknown>>(sql`
    INSERT INTO task_request.task_requests (
      workspace_id, display_id, source_type, source_id, primary_managed_system_id,
      evidence_summary, requested_outcome, requester_actor_id, status
    )
    VALUES (
      ${input.workspaceId}, ${displayId}, ${input.sourceType}, ${input.sourceId},
      ${input.primaryManagedSystemId}, ${input.evidenceSummary},
      ${input.requestedOutcome}, ${input.requesterActorId}, 'pending_review'
    )
    RETURNING
      id, workspace_id, display_id, source_type, source_id, primary_managed_system_id,
      evidence_summary, requested_outcome, requester_actor_id, status,
      reviewer_actor_id, decision_reason, decided_at,
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
      id, workspace_id, display_id, source_type, source_id, primary_managed_system_id,
      evidence_summary, requested_outcome, requester_actor_id, status,
      reviewer_actor_id, decision_reason, decided_at,
      created_at, updated_at
    FROM task_request.task_requests
    WHERE id = ${input.taskRequestId}
      AND workspace_id = ${input.workspaceId}
    LIMIT 1
  `);
  const row = result.rows[0];
  return row ? mapTaskRequestRow(row) : null;
}

export async function lockTaskRequestById(
  tx: Tx,
  input: { workspaceId: string; taskRequestId: string },
): Promise<TaskRequestRow | null> {
  const result = await tx.execute<Record<string, unknown>>(sql`
    SELECT
      id, workspace_id, display_id, source_type, source_id, primary_managed_system_id,
      evidence_summary, requested_outcome, requester_actor_id, status,
      reviewer_actor_id, decision_reason, decided_at,
      created_at, updated_at
    FROM task_request.task_requests
    WHERE id = ${input.taskRequestId}
      AND workspace_id = ${input.workspaceId}
    FOR UPDATE
    LIMIT 1
  `);
  const row = result.rows[0];
  return row ? mapTaskRequestRow(row) : null;
}

export async function listTaskRequestsByWorkspace(
  db: Db | Tx,
  input: {
    workspaceId: string;
    status?: TaskRequestRow['status'];
  },
): Promise<TaskRequestRow[]> {
  const statusPredicate = input.status === undefined ? sql`TRUE` : sql`status = ${input.status}`;
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT
      id, workspace_id, display_id, source_type, source_id, primary_managed_system_id,
      evidence_summary, requested_outcome, requester_actor_id, status,
      reviewer_actor_id, decision_reason, decided_at,
      created_at, updated_at
    FROM task_request.task_requests
    WHERE workspace_id = ${input.workspaceId}
      AND ${statusPredicate}
    ORDER BY created_at DESC, id DESC
  `);
  return result.rows.map(mapTaskRequestRow);
}

export async function updateTaskRequestDecision(
  tx: Tx,
  input: {
    workspaceId: string;
    taskRequestId: string;
    status: TaskRequestRow['status'];
    reviewerActorId: string;
    decisionReason: string | null;
  },
): Promise<TaskRequestRow> {
  const result = await tx.execute<Record<string, unknown>>(sql`
    UPDATE task_request.task_requests
       SET status = ${input.status},
           reviewer_actor_id = ${input.reviewerActorId},
           decision_reason = ${input.decisionReason},
           decided_at = now(),
           updated_at = now()
     WHERE id = ${input.taskRequestId}
       AND workspace_id = ${input.workspaceId}
    RETURNING
      id, workspace_id, display_id, source_type, source_id, primary_managed_system_id,
      evidence_summary, requested_outcome, requester_actor_id, status,
      reviewer_actor_id, decision_reason, decided_at,
      created_at, updated_at
  `);
  const row = result.rows[0];
  if (!row) throw new Error('updateTaskRequestDecision returned no row');
  return mapTaskRequestRow(row);
}
