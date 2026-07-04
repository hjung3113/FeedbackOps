import { sql } from 'drizzle-orm';

import type { TaskPriority, TaskStatus } from '@fops/shared';

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';

export interface TaskRow {
  id: string;
  workspace_id: string;
  primary_managed_system_id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_actor_id: string | null;
  due_date: string | null;
  milestone_id: string | null;
  analytics_area_id: string | null;
  source_task_request_id: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function mapTaskRow(row: Record<string, unknown>): TaskRow {
  return {
    id: row.id as string,
    workspace_id: row.workspace_id as string,
    primary_managed_system_id: row.primary_managed_system_id as string,
    title: row.title as string,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    assignee_actor_id: (row.assignee_actor_id as string | null) ?? null,
    due_date: (row.due_date as string | null) ?? null,
    milestone_id: (row.milestone_id as string | null) ?? null,
    analytics_area_id: (row.analytics_area_id as string | null) ?? null,
    source_task_request_id: (row.source_task_request_id as string | null) ?? null,
    created_by: row.created_by as string,
    created_at: toDate(row.created_at as Date | string),
    updated_at: toDate(row.updated_at as Date | string),
  };
}

const TASK_SELECT = sql`
  id, workspace_id, primary_managed_system_id, title, status, priority,
  assignee_actor_id, due_date::text AS due_date, milestone_id, analytics_area_id,
  source_task_request_id, created_by, created_at, updated_at
`;

export async function insertTask(
  tx: Tx,
  input: {
    workspaceId: string;
    primaryManagedSystemId: string;
    title: string;
    priority: TaskPriority;
    assigneeActorId: string | null;
    dueDate: string | null;
    milestoneId: string | null;
    analyticsAreaId: string | null;
    sourceTaskRequestId: string | null;
    createdBy: string;
  },
): Promise<TaskRow> {
  const result = await tx.execute<Record<string, unknown>>(sql`
    INSERT INTO task.tasks (
      workspace_id, primary_managed_system_id, title, status, priority,
      assignee_actor_id, due_date, milestone_id, analytics_area_id,
      source_task_request_id, created_by
    )
    VALUES (
      ${input.workspaceId}, ${input.primaryManagedSystemId}, ${input.title}, 'backlog',
      ${input.priority}, ${input.assigneeActorId}, ${input.dueDate},
      ${input.milestoneId}, ${input.analyticsAreaId}, ${input.sourceTaskRequestId},
      ${input.createdBy}
    )
    RETURNING ${TASK_SELECT}
  `);
  const row = result.rows[0];
  if (!row) throw new Error('insertTask returned no row');
  return mapTaskRow(row);
}

export async function lockTaskById(
  tx: Tx,
  input: { workspaceId: string; taskId: string },
): Promise<TaskRow | null> {
  const result = await tx.execute<Record<string, unknown>>(sql`
    SELECT ${TASK_SELECT}
      FROM task.tasks
     WHERE id = ${input.taskId}
       AND workspace_id = ${input.workspaceId}
     FOR UPDATE
     LIMIT 1
  `);
  const row = result.rows[0];
  return row ? mapTaskRow(row) : null;
}

export async function findTaskById(
  db: Db | Tx,
  input: { workspaceId: string; taskId: string },
): Promise<TaskRow | null> {
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT ${TASK_SELECT}
      FROM task.tasks
     WHERE id = ${input.taskId}
       AND workspace_id = ${input.workspaceId}
     LIMIT 1
  `);
  const row = result.rows[0];
  return row ? mapTaskRow(row) : null;
}

export async function listTasksByWorkspace(
  db: Db | Tx,
  input: {
    workspaceId: string;
    status?: TaskStatus;
    assigneeActorId?: string;
  },
): Promise<TaskRow[]> {
  const predicates = [sql`workspace_id = ${input.workspaceId}`];
  if (input.status !== undefined) predicates.push(sql`status = ${input.status}`);
  if (input.assigneeActorId !== undefined) {
    predicates.push(sql`assignee_actor_id = ${input.assigneeActorId}`);
  }
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT ${TASK_SELECT}
      FROM task.tasks
     WHERE ${sql.join(predicates, sql` AND `)}
     ORDER BY updated_at DESC, id DESC
  `);
  return result.rows.map(mapTaskRow);
}

export async function markTaskRequestConverted(
  tx: Tx,
  input: { workspaceId: string; taskRequestId: string },
): Promise<void> {
  await tx.execute(sql`
    UPDATE task_request.task_requests
       SET status = 'converted',
           updated_at = now()
     WHERE id = ${input.taskRequestId}
       AND workspace_id = ${input.workspaceId}
  `);
}
