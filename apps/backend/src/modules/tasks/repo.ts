import { sql } from 'drizzle-orm';

import type { TaskDetailSource, TaskPriority, TaskStatus } from '@fops/shared';

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';

export interface TaskRow {
  id: string;
  workspace_id: string;
  display_id: string;
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
    display_id: row.display_id as string,
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
  id, workspace_id, display_id, primary_managed_system_id, title, status, priority,
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
  const displayRows = await tx.execute<{ v: string }>(sql`
    select core.next_display_id(${input.workspaceId}, 'task') as v
  `);
  const displayId = displayRows.rows[0]?.v;
  if (!displayId) {
    throw new Error('next_display_id returned empty');
  }

  const result = await tx.execute<Record<string, unknown>>(sql`
    INSERT INTO task.tasks (
      workspace_id, display_id, primary_managed_system_id, title, status, priority,
      assignee_actor_id, due_date, milestone_id, analytics_area_id,
      source_task_request_id, created_by
    )
    VALUES (
      ${input.workspaceId}, ${displayId}, ${input.primaryManagedSystemId}, ${input.title},
      'backlog', ${input.priority}, ${input.assigneeActorId}, ${input.dueDate},
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

export async function updateTaskStatus(
  tx: Tx,
  input: { workspaceId: string; taskId: string; status: TaskStatus },
): Promise<TaskRow> {
  const result = await tx.execute<Record<string, unknown>>(sql`
    UPDATE task.tasks
       SET status = ${input.status},
           updated_at = now()
     WHERE id = ${input.taskId}
       AND workspace_id = ${input.workspaceId}
     RETURNING ${TASK_SELECT}
  `);
  const row = result.rows[0];
  if (!row) throw new Error('updateTaskStatus returned no row');
  return mapTaskRow(row);
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

export async function resolveTaskSource(
  db: Db | Tx,
  input: { workspaceId: string; sourceTaskRequestId: string },
): Promise<TaskDetailSource | null> {
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT
      tr.id AS task_request_id,
      tr.status AS task_request_status,
      f.id AS finding_id,
      f.title AS finding_title,
      f.summary AS finding_summary,
      f.evidence_count AS finding_evidence_count
    FROM task_request.task_requests tr
    LEFT JOIN core.entity_links el
      ON el.workspace_id = tr.workspace_id
     AND el.source_type = 'finding'
     AND el.target_type = 'task_request'
     AND el.target_id = tr.id
     AND el.relation_type = 'requested_task'
     AND el.status = 'active'
    LEFT JOIN finding.findings f
      ON f.workspace_id = tr.workspace_id
     AND f.id = el.source_id
    WHERE tr.workspace_id = ${input.workspaceId}
      AND tr.id = ${input.sourceTaskRequestId}
    ORDER BY el.created_at DESC NULLS LAST, el.id DESC NULLS LAST
    LIMIT 1
  `);
  const row = result.rows[0];
  if (!row) return null;

  const source: TaskDetailSource = {
    task_request: {
      id: row.task_request_id as string,
      status: row.task_request_status as NonNullable<TaskDetailSource['task_request']>['status'],
    },
  };
  if (row.finding_id) {
    source.finding = {
      id: row.finding_id as string,
      title: row.finding_title as string,
      summary: row.finding_summary as string,
      evidence_count: Number(row.finding_evidence_count),
    };
  }
  return source;
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
