import type { DbHandle } from '../../../db/client.js';

export async function insertTaskRequestRow(
  dbHandle: DbHandle,
  input: {
    workspaceId: string;
    sourceType?: 'finding' | 'voc' | 'voc_cluster';
    sourceId: string;
    primaryManagedSystemId: string;
    evidenceSummary?: string;
    requestedOutcome?: string;
    requesterActorId: string;
    status?: 'pending_review' | 'approved' | 'rejected' | 'needs_more_evidence' | 'converted';
    reviewerActorId?: string | null;
    decisionReason?: string | null;
    decided?: boolean;
  },
): Promise<{ id: string; display_id: string }> {
  const res = await dbHandle.pool.query<{ id: string; display_id: string }>(
    `insert into task_request.task_requests (
        workspace_id, display_id, source_type, source_id, primary_managed_system_id,
        evidence_summary, requested_outcome, requester_actor_id, status,
        reviewer_actor_id, decision_reason, decided_at
      )
     values (
        $1, core.next_display_id($1::uuid, 'task_request'), $2, $3, $4,
        $5, $6, $7, $8, $9, $10, ${input.decided ? 'now()' : 'NULL'}
      )
     returning id, display_id`,
    [
      input.workspaceId,
      input.sourceType ?? 'finding',
      input.sourceId,
      input.primaryManagedSystemId,
      input.evidenceSummary ?? 'Evidence summary',
      input.requestedOutcome ?? 'Requested outcome',
      input.requesterActorId,
      input.status ?? 'pending_review',
      input.reviewerActorId ?? null,
      input.decisionReason ?? null,
    ],
  );
  const row = res.rows[0];
  if (!row) throw new Error(`insertTaskRequestRow failed for source=${input.sourceId}`);
  return row;
}
