import { sql } from 'drizzle-orm';

import type { TaskCommentKind, TaskDetailSource, TaskPriority, TaskStatus } from '@fops/shared';

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

export interface TaskCommentRow {
  id: string;
  task_id: string;
  actor_id: string;
  kind: TaskCommentKind;
  from_status: TaskStatus | null;
  to_status: TaskStatus | null;
  body_rich_content: unknown;
  created_at: Date;
  // Postgres text-cast timestamp (microsecond precision) — see
  // findings/repo.ts FindingCommentRow.created_at_raw for the rationale.
  created_at_raw: string;
}

function mapTaskCommentRow(row: Record<string, unknown>): TaskCommentRow {
  return {
    id: row.id as string,
    task_id: row.task_id as string,
    actor_id: row.actor_id as string,
    kind: row.kind as TaskCommentKind,
    from_status: (row.from_status as TaskStatus | null) ?? null,
    to_status: (row.to_status as TaskStatus | null) ?? null,
    body_rich_content: row.body_rich_content,
    created_at:
      row.created_at instanceof Date ? row.created_at : new Date(row.created_at as string),
    created_at_raw: String(row.created_at_raw ?? row.created_at),
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

// #514 B1b — the assign command writes milestone_id and updated_at only.
export async function updateTaskMilestone(
  tx: Tx,
  input: { workspaceId: string; taskId: string; milestoneId: string | null },
): Promise<TaskRow> {
  const result = await tx.execute<Record<string, unknown>>(sql`
    UPDATE task.tasks
       SET milestone_id = ${input.milestoneId},
           updated_at = now()
     WHERE id = ${input.taskId}
       AND workspace_id = ${input.workspaceId}
     RETURNING ${TASK_SELECT}
  `);
  const row = result.rows[0];
  if (!row) throw new Error('updateTaskMilestone returned no row');
  return mapTaskRow(row);
}

export async function insertTaskComment(
  tx: Tx,
  input: {
    workspaceId: string;
    taskId: string;
    actorId: string;
    kind: TaskCommentKind;
    fromStatus: TaskStatus | null;
    toStatus: TaskStatus | null;
    bodyRichContent: unknown;
  },
): Promise<TaskCommentRow> {
  const result = await tx.execute<Record<string, unknown>>(sql`
    INSERT INTO task.task_comments (
      workspace_id, task_id, actor_id, kind, from_status, to_status, body_rich_content
    )
    VALUES (
      ${input.workspaceId}, ${input.taskId}, ${input.actorId}, ${input.kind},
      ${input.fromStatus}, ${input.toStatus},
      ${JSON.stringify(input.bodyRichContent)}::jsonb
    )
    RETURNING id, task_id, actor_id, kind, from_status, to_status, body_rich_content,
      created_at, created_at::text AS created_at_raw
  `);
  const row = result.rows[0];
  if (!row) throw new Error('insertTaskComment returned no row');
  return mapTaskCommentRow(row);
}

export async function listTaskComments(
  db: Db | Tx,
  input: {
    workspaceId: string;
    taskId: string;
    cursor?: { createdAt: string; id: string };
    limit: number;
  },
): Promise<{ rows: TaskCommentRow[]; hasMore: boolean }> {
  const cursorPredicate = input.cursor
    ? sql`
        AND (
          created_at < ${input.cursor.createdAt}::timestamptz
          OR (created_at = ${input.cursor.createdAt}::timestamptz AND id < ${input.cursor.id}::uuid)
        )
      `
    : sql``;
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT id, task_id, actor_id, kind, from_status, to_status, body_rich_content,
      created_at, created_at::text AS created_at_raw
    FROM task.task_comments
    WHERE workspace_id = ${input.workspaceId}
      AND task_id = ${input.taskId}
      ${cursorPredicate}
    ORDER BY created_at DESC, id DESC
    LIMIT ${input.limit + 1}
  `);
  const hasMore = result.rows.length > input.limit;
  return {
    rows: result.rows.slice(0, input.limit).map(mapTaskCommentRow),
    hasMore,
  };
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
    managedSystemId?: string;
    publicUpdate?: 'missing';
    milestoneId?: string;
  },
): Promise<TaskRow[]> {
  const predicates = [sql`workspace_id = ${input.workspaceId}`];
  if (input.status !== undefined) predicates.push(sql`status = ${input.status}`);
  if (input.assigneeActorId !== undefined) {
    predicates.push(sql`assignee_actor_id = ${input.assigneeActorId}`);
  }
  if (input.managedSystemId !== undefined) {
    predicates.push(sql`primary_managed_system_id = ${input.managedSystemId}`);
  }
  // Gap side of countReleasedTasksWithPublicUpdate (dashboard/repo.ts):
  // released, in that denominator, and not in that numerator. Do not import it.
  if (input.publicUpdate === 'missing') {
    predicates.push(sql`
      status = 'released'
      AND EXISTS (
        SELECT 1
        FROM core.entity_links link
        JOIN voc.vocs voc
          ON voc.id = link.source_id
         AND voc.workspace_id = link.workspace_id
         AND voc.archived_at IS NULL
        WHERE link.workspace_id = task.tasks.workspace_id
          AND link.source_type = 'voc'
          AND link.target_type = 'task'
          AND link.target_id = task.tasks.id
          AND link.relation_type = 'evidence_of'
          AND link.status = 'active'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM core.entity_links link
        JOIN voc.vocs voc
          ON voc.id = link.source_id
         AND voc.workspace_id = link.workspace_id
         AND voc.archived_at IS NULL
        JOIN voc.voc_public_updates public_update
          ON public_update.voc_id = voc.id
         AND public_update.skip_public_update = false
        WHERE link.workspace_id = task.tasks.workspace_id
          AND link.source_type = 'voc'
          AND link.target_type = 'task'
          AND link.target_id = task.tasks.id
          AND link.relation_type = 'evidence_of'
          AND link.status = 'active'
      )
    `);
  }
  if (input.milestoneId !== undefined) {
    predicates.push(sql`milestone_id = ${input.milestoneId}`);
  }
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT ${TASK_SELECT}
      FROM task.tasks
     WHERE ${sql.join(predicates, sql` AND `)}
     ORDER BY updated_at DESC, id DESC
  `);
  return result.rows.map(mapTaskRow);
}
export interface MilestoneTaskCounts {
  released_done: number;
  in_flight: number;
  queued: number;
  total: number;
}

// #514 B1c — one grouped child-count query for a page of Milestone ids.
// Buckets: released_done = done + released; in_flight = doing + review +
// reopened (counting reopened as in flight is the design §7 item 4
// proposal); queued = backlog + todo; total = child count. An empty
// Milestone is omitted by GROUP BY; the caller fills zeros.
export async function countTasksByMilestone(
  db: Db | Tx,
  input: { workspaceId: string; milestoneIds: string[] },
): Promise<Map<string, MilestoneTaskCounts>> {
  const counts = new Map<string, MilestoneTaskCounts>();
  if (input.milestoneIds.length === 0) return counts;
  const result = await (db as Db).execute<{
    milestone_id: string;
    released_done: number;
    in_flight: number;
    queued: number;
    total: number;
  }>(sql`
    SELECT milestone_id,
           COUNT(*) FILTER (WHERE status IN ('done', 'released'))::int AS released_done,
           COUNT(*) FILTER (WHERE status IN ('doing', 'review', 'reopened'))::int AS in_flight,
           COUNT(*) FILTER (WHERE status IN ('backlog', 'todo'))::int AS queued,
           COUNT(*)::int AS total
      FROM task.tasks
     WHERE workspace_id = ${input.workspaceId}
       AND milestone_id IN (${sql.join(
         input.milestoneIds.map((id) => sql`${id}`),
         sql`, `,
       )})
     GROUP BY milestone_id
  `);
  for (const row of result.rows) {
    counts.set(row.milestone_id, {
      released_done: Number(row.released_done),
      in_flight: Number(row.in_flight),
      queued: Number(row.queued),
      total: Number(row.total),
    });
  }
  return counts;
}

export interface ResolvedTaskSource {
  source: TaskDetailSource;
  /**
   * VOC id backing the source trail per #378 precedence: the Task Request's
   * own `source_type='voc'` wins over the resolved Finding's. The repo never
   * reads VOC tables and the id is never serialized unresolved — the service
   * resolves it to a visibility verdict through VocReadService first.
   */
  vocId: string | null;
}

export async function resolveTaskSource(
  db: Db | Tx,
  input: { workspaceId: string; sourceTaskRequestId: string },
): Promise<ResolvedTaskSource | null> {
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT
      tr.id AS task_request_id,
      tr.status AS task_request_status,
      tr.source_type AS task_request_source_type,
      tr.source_id AS task_request_source_id,
      f.id AS finding_id,
      f.title AS finding_title,
      f.summary AS finding_summary,
      f.evidence_count AS finding_evidence_count,
      f.source_type AS finding_source_type,
      f.source_id AS finding_source_id
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
  const taskRequestSourceId = row.task_request_source_id as string | null;
  const findingSourceId = row.finding_source_id as string | null;
  const vocId =
    row.task_request_source_type === 'voc' && taskRequestSourceId
      ? taskRequestSourceId
      : row.finding_source_type === 'voc' && findingSourceId
        ? findingSourceId
        : null;
  return { source, vocId };
}
