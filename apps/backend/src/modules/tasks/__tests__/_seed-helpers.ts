import type { DbHandle } from '../../../db/client.js';

export async function insertTaskRow(
  dbHandle: DbHandle,
  input: {
    workspaceId: string;
    primaryManagedSystemId: string;
    title?: string;
    status?: 'backlog' | 'todo' | 'doing' | 'review' | 'done' | 'released' | 'reopened';
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    assigneeActorId?: string | null;
    dueDate?: string | null;
    milestoneId?: string | null;
    analyticsAreaId?: string | null;
    sourceTaskRequestId?: string | null;
    createdBy: string;
  },
): Promise<{ id: string; display_id: string }> {
  const res = await dbHandle.pool.query<{ id: string; display_id: string }>(
    `insert into task.tasks (
        workspace_id, display_id, primary_managed_system_id, title, status, priority,
        assignee_actor_id, due_date, milestone_id, analytics_area_id,
        source_task_request_id, created_by
      )
     values (
        $1, core.next_display_id($1::uuid, 'task'), $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11
      )
     returning id, display_id`,
    [
      input.workspaceId,
      input.primaryManagedSystemId,
      input.title ?? 'Seed task',
      input.status ?? 'backlog',
      input.priority ?? 'medium',
      input.assigneeActorId ?? null,
      input.dueDate ?? null,
      input.milestoneId ?? null,
      input.analyticsAreaId ?? null,
      input.sourceTaskRequestId ?? null,
      input.createdBy,
    ],
  );
  const row = res.rows[0];
  if (!row) throw new Error(`insertTaskRow failed for title=${input.title ?? 'Seed task'}`);
  return row;
}
