import {
  type ListTasksQuery,
  type ListTasksResponse,
  type TaskDto,
  listTasksQuerySchema,
  splitTaskListTokens,
} from '@fops/shared';

// Test double for GET /tasks as the bounded Task board uses it: it parses every request with the
// shared query schema and answers by status / status_group / filters / limit / cursor, so a board
// test fails when the board sends a request the real contract would reject.

// Older board fixtures predate `assignee_team_id`.
type FixtureTask = Omit<TaskDto, 'assignee_team_id'> & Partial<Pick<TaskDto, 'assignee_team_id'>>;
type Extra = (task: FixtureTask, query: ListTasksQuery) => boolean;

export function parseBoardQuery(raw: Record<string, unknown>): ListTasksQuery {
  return listTasksQuerySchema.parse(
    Object.fromEntries(
      Object.entries(raw)
        .filter(([key, value]) => value !== undefined && key !== 'signal')
        .map(([key, value]) => [key, String(value)]),
    ),
  );
}

function matches(task: FixtureTask, query: ListTasksQuery, extra?: Extra): boolean {
  if (query.status !== undefined && task.status !== query.status) return false;
  if (query.status_group === 'open' && ['done', 'released'].includes(task.status)) return false;
  if (query.status_group === 'in-flight' && !['todo', 'doing', 'review'].includes(task.status)) {
    return false;
  }
  if (
    query.managed_system_id !== undefined &&
    query.managed_system_id !== 'all' &&
    task.primary_managed_system_id !== query.managed_system_id
  ) {
    return false;
  }
  if (query.q !== undefined && !task.title.includes(query.q)) return false;
  if (
    query.priority !== undefined &&
    !splitTaskListTokens(query.priority).includes(task.priority)
  ) {
    return false;
  }
  if (query.assignee !== undefined) {
    const tokens = splitTaskListTokens(query.assignee);
    const unassigned =
      (task.assignee_actor_id ?? null) === null && (task.assignee_team_id ?? null) === null;
    const hit =
      (tokens.includes('unassigned') && unassigned) ||
      (task.assignee_actor_id !== null && tokens.includes(task.assignee_actor_id));
    if (!hit) return false;
  }
  if (query.milestone_id !== undefined) {
    const tokens = splitTaskListTokens(query.milestone_id);
    const hit =
      (tokens.includes('any') && task.milestone_id !== null) ||
      (tokens.includes('none') && task.milestone_id === null) ||
      (task.milestone_id !== null && tokens.includes(task.milestone_id));
    if (!hit) return false;
  }
  return extra ? extra(task, query) : true;
}

export function listBoardTasks(
  all: readonly FixtureTask[],
  raw: Record<string, unknown>,
  extra?: Extra,
): ListTasksResponse {
  const query = parseBoardQuery(raw);
  const rows = all.filter((task) => matches(task, query, extra)) as TaskDto[];
  if (query.limit === undefined) return { items: rows };
  const start = query.cursor === undefined ? 0 : Number(query.cursor);
  const end = start + query.limit;
  return {
    items: rows.slice(start, end),
    page: {
      has_more: end < rows.length,
      ...(end < rows.length ? { cursor: String(end) } : {}),
      ...(query.cursor === undefined ? { total: rows.length } : {}),
    },
  };
}

/** `listTasks` module-mock implementation over a fixed Task set. */
export const boardList =
  (all: readonly FixtureTask[], extra?: Extra) =>
  async (options: Record<string, unknown> = {}) =>
    listBoardTasks(all, options, extra);
