import { sql } from 'drizzle-orm';
import type { ListCursor } from '../../lib/list-cursor.js';
import type { Scope, ScopeActorContext } from '../permissions/scope-service.js';

import type { TaskCommentKind, TaskDetailSource, TaskPriority, TaskStatus } from '@fops/shared';

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import { releasedTaskUnresolvedVocPredicate } from '../voc/index.js';

export interface TaskRow {
  cursor_timestamp?: string;
  id: string;
  workspace_id: string;
  display_id: string;
  primary_managed_system_id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_actor_id: string | null;
  assignee_team_id: string | null;
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
    ...(row.cursor_timestamp == null ? {} : { cursor_timestamp: String(row.cursor_timestamp) }),
    id: row.id as string,
    workspace_id: row.workspace_id as string,
    display_id: row.display_id as string,
    primary_managed_system_id: row.primary_managed_system_id as string,
    title: row.title as string,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    assignee_actor_id: (row.assignee_actor_id as string | null) ?? null,
    assignee_team_id: (row.assignee_team_id as string | null) ?? null,
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
  assignee_actor_id, assignee_team_id, due_date::text AS due_date, milestone_id, analytics_area_id,
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
    assigneeTeamId?: string | null;
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
      assignee_actor_id, assignee_team_id, due_date, milestone_id, analytics_area_id,
      source_task_request_id, created_by
    )
    VALUES (
      ${input.workspaceId}, ${displayId}, ${input.primaryManagedSystemId}, ${input.title},
      'backlog', ${input.priority}, ${input.assigneeActorId}, ${input.assigneeTeamId ?? null}, ${input.dueDate},
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
           updated_at = GREATEST(now(), updated_at + INTERVAL '1 millisecond')
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

// Display id → id for /nav/resolve (#731). Same row population findTaskById
// reads: no status filter, mirroring the Task detail read.
export async function findTaskIdByDisplayId(
  db: Db | Tx,
  input: { workspaceId: string; displayId: string },
): Promise<{ id: string; primary_managed_system_id: string } | null> {
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT id, primary_managed_system_id
      FROM task.tasks
     WHERE display_id = ${input.displayId}
       AND workspace_id = ${input.workspaceId}
     LIMIT 1
  `);
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id as string,
    primary_managed_system_id: row.primary_managed_system_id as string,
  };
}

interface ListInput {
  workspaceId: string;
  status?: TaskStatus;
  assigneeActorId?: string;
  assigneeTeamId?: string;
  managedSystemId?: string;
  analyticsAreaId?: string;
  statusGroup?: 'in-flight';
  overdue?: 'true';
  reporterUpdate?: 'needed';
  publicUpdate?: 'missing';
  milestoneId?: string;
  allowedSystemIds?: string[];
  limit?: number;
  cursor?: ListCursor;
}

function releasedWithVocPredicate() {
  return sql`status = 'released' AND EXISTS (
        SELECT 1
        FROM core.entity_links_app link
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
      )`;
}
function releasedWithPublicUpdatePredicate() {
  return sql`EXISTS (
        SELECT 1
        FROM core.entity_links_app link
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
      )`;
}

function listPredicates(input: ListInput) {
  const predicates = [sql`workspace_id = ${input.workspaceId}`];
  if (input.status !== undefined) predicates.push(sql`status = ${input.status}`);
  if (input.assigneeTeamId !== undefined)
    predicates.push(sql`assignee_team_id = ${input.assigneeTeamId}`);
  if (input.assigneeActorId !== undefined) {
    predicates.push(sql`assignee_actor_id = ${input.assigneeActorId}`);
  }
  if (input.managedSystemId !== undefined) {
    predicates.push(sql`primary_managed_system_id = ${input.managedSystemId}`);
  }
  if (input.analyticsAreaId !== undefined) {
    predicates.push(
      input.analyticsAreaId === 'unset'
        ? sql`analytics_area_id IS NULL`
        : sql`analytics_area_id = ${input.analyticsAreaId}::uuid`,
    );
  }
  if (input.statusGroup === 'in-flight')
    predicates.push(sql`status IN ('todo', 'doing', 'review')`);
  if (input.overdue === 'true')
    predicates.push(sql`status IN ('backlog', 'todo', 'doing', 'review', 'reopened')
      AND due_date IS NOT NULL AND due_date < (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date`);
  if (input.reporterUpdate === 'needed')
    predicates.push(
      sql`status = 'released' AND ${releasedTaskUnresolvedVocPredicate(input.workspaceId, sql`task.tasks.id`)}`,
    );
  if (input.publicUpdate === 'missing') {
    predicates.push(
      sql`${releasedWithVocPredicate()} AND NOT (${releasedWithPublicUpdatePredicate()})`,
    );
  }
  if (input.milestoneId !== undefined) {
    predicates.push(sql`milestone_id = ${input.milestoneId}`);
  }
  if (input.allowedSystemIds !== undefined)
    predicates.push(
      sql`primary_managed_system_id = ANY(${sql.param(input.allowedSystemIds)}::uuid[])`,
    );
  return predicates;
}

export async function listTasksByWorkspace(db: Db | Tx, input: ListInput): Promise<TaskRow[]> {
  const predicates = listPredicates(input);
  if (input.cursor !== undefined)
    predicates.push(
      sql`(updated_at, id) < (${input.cursor.timestamp}::timestamptz, ${input.cursor.id}::uuid)`,
    );
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT ${TASK_SELECT}, updated_at::text AS cursor_timestamp
      FROM task.tasks
     WHERE ${sql.join(predicates, sql` AND `)}
     ORDER BY updated_at DESC, id DESC
    ${input.limit === undefined ? sql`` : sql`LIMIT ${input.limit + 1}`}
  `);
  return result.rows.map(mapTaskRow);
}
export async function countListRows(db: Db | Tx, input: ListInput): Promise<number> {
  const result = await (db as Db).execute<{ total: number }>(sql`
    SELECT count(*)::int AS total FROM task.tasks 
    WHERE ${sql.join(listPredicates(input), sql` AND `)}
  `);
  return Number(result.rows[0]?.total ?? 0);
}

export async function listPrimaryManagedSystemIds(
  db: Db | Tx,
  input: { workspaceId: string; managedSystemId?: string },
): Promise<string[]> {
  const result = await (db as Db).execute<{ id: string }>(sql`
    SELECT DISTINCT primary_managed_system_id AS id FROM task.tasks
    WHERE workspace_id = ${input.workspaceId}
    ${input.managedSystemId === undefined ? sql`` : sql`AND primary_managed_system_id = ${input.managedSystemId}`}
  `);
  return result.rows.map((row) => row.id);
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
      tr.display_id AS task_request_display_id,
      tr.status AS task_request_status,
      tr.source_type AS task_request_source_type,
      tr.source_id AS task_request_source_id,
      f.id AS finding_id,
      f.display_id AS finding_display_id,
      f.title AS finding_title,
      f.summary AS finding_summary,
      f.evidence_count AS finding_evidence_count,
      f.source_type AS finding_source_type,
      f.source_id AS finding_source_id
    FROM task_request.task_requests tr
    LEFT JOIN core.entity_links_app el
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
    ORDER BY (tr.source_type = 'finding' AND el.source_id = tr.source_id) DESC NULLS LAST,
             el.created_at DESC NULLS LAST,
             el.id DESC NULLS LAST
    LIMIT 1
  `);
  const row = result.rows[0];
  if (!row) return null;

  const source: TaskDetailSource = {
    task_request: {
      id: row.task_request_id as string,
      display_id: row.task_request_display_id as string,
      status: row.task_request_status as NonNullable<TaskDetailSource['task_request']>['status'],
    },
  };
  if (row.finding_id) {
    source.finding = {
      id: row.finding_id as string,
      display_id: row.finding_display_id as string,
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

export async function updateTaskResponsibility(
  tx: Tx,
  input: {
    workspaceId: string;
    taskId: string;
    actorId: string | null;
    teamId: string | null;
  },
): Promise<TaskRow> {
  const rows = await tx.execute(sql`UPDATE task.tasks SET
    assignee_actor_id = ${input.actorId}, assignee_team_id = ${input.teamId}, updated_at = GREATEST(now(), updated_at + INTERVAL '1 millisecond')
    WHERE workspace_id = ${input.workspaceId} AND id = ${input.taskId}
    RETURNING ${TASK_SELECT}`);
  const row = rows.rows[0];
  if (!row) throw new Error('updateTaskResponsibility returned no row');
  return mapTaskRow(row);
}

export type TaskReportGroup = {
  managed_system_id: string;
  analytics_area_id: string | null;
  total: number;
  backlog: number;
  todo: number;
  doing: number;
  review: number;
  done: number;
  released: number;
  reopened: number;
  in_flight: number;
  overdue: number;
  released_total: number;
  released_updated: number;
  public_update_missing: number;
  reporter_update_needed: number;
};
export async function countGroupedTasksForReport(
  db: Db,
  args: { actor: ScopeActorContext; readScope: Scope; managedSystemId?: string },
): Promise<{ as_of_date: string; rows: TaskReportGroup[] }> {
  const base: ListInput = {
    workspaceId: args.actor.workspace_id,
    ...(args.managedSystemId === undefined ? {} : { managedSystemId: args.managedSystemId }),
    ...(args.readScope.kind === 'all' ? {} : { allowedSystemIds: args.readScope.managedSystemIds }),
  };
  const filter = (extra: Partial<ListInput>) =>
    sql.join(listPredicates({ ...base, ...extra }), sql` AND `);
  const result = await db.execute<{ as_of_date: string; groups: TaskReportGroup[] }>(sql`
    WITH report_tasks AS MATERIALIZED (
      SELECT id, workspace_id, primary_managed_system_id, analytics_area_id, status, due_date
      FROM task.tasks WHERE ${filter({})}
    ), released_voc_links AS MATERIALIZED (
      SELECT link.target_id AS task_id, voc.id AS voc_id, voc.reporter_facing_status
      FROM report_tasks
      JOIN core.entity_links_app link
        ON link.workspace_id = report_tasks.workspace_id
       AND link.target_id = report_tasks.id
       AND link.source_type = 'voc'
       AND link.target_type = 'task'
       AND link.relation_type = 'evidence_of'
       AND link.status = 'active'
      JOIN voc.vocs voc
        ON voc.id = link.source_id
       AND voc.workspace_id = link.workspace_id
       AND voc.archived_at IS NULL
      WHERE report_tasks.status = 'released'
    ), released_vocs AS (
      SELECT task_id,
        bool_or(reporter_facing_status NOT IN ('resolved', 'closed')) AS unresolved
      FROM released_voc_links GROUP BY task_id
    ), released_updates AS (
      SELECT DISTINCT link.task_id
      FROM released_voc_links link
      JOIN voc.voc_public_updates public_update
        ON public_update.voc_id = link.voc_id
       AND public_update.skip_public_update = false
    ), grouped AS (
      SELECT primary_managed_system_id AS managed_system_id, analytics_area_id, count(*)::int AS total,
        count(*) FILTER (WHERE status='backlog')::int AS backlog,
        count(*) FILTER (WHERE status='todo')::int AS todo,
        count(*) FILTER (WHERE status='doing')::int AS doing,
        count(*) FILTER (WHERE status='review')::int AS review,
        count(*) FILTER (WHERE status='done')::int AS done,
        count(*) FILTER (WHERE status='released')::int AS released,
        count(*) FILTER (WHERE status='reopened')::int AS reopened,
        count(*) FILTER (WHERE ${filter({ statusGroup: 'in-flight' })})::int AS in_flight,
        count(*) FILTER (WHERE ${filter({ overdue: 'true' })})::int AS overdue,
        count(*) FILTER (WHERE released_vocs.task_id IS NOT NULL)::int AS released_total,
        count(*) FILTER (WHERE released_updates.task_id IS NOT NULL)::int AS released_updated,
        count(*) FILTER (WHERE released_vocs.task_id IS NOT NULL AND released_updates.task_id IS NULL)::int AS public_update_missing,
        count(*) FILTER (WHERE released_vocs.unresolved)::int AS reporter_update_needed
      FROM report_tasks
      LEFT JOIN released_vocs ON released_vocs.task_id = report_tasks.id
      LEFT JOIN released_updates ON released_updates.task_id = report_tasks.id
      GROUP BY primary_managed_system_id, analytics_area_id
    ) SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date::text AS as_of_date,
      coalesce(jsonb_agg(grouped), '[]'::jsonb) AS groups FROM grouped
  `);
  const row = result.rows[0];
  if (!row) throw new Error('Task report clock missing');
  return { as_of_date: row.as_of_date, rows: row.groups };
}
