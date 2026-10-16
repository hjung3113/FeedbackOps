import { listTasks } from '@/lib/api/tasks';
import { placeholderDataForSearchOnly } from '@/lib/query/placeholder-data-for-search';
import type { ListTasksResponse, TaskDto, TaskStatus } from '@fops/shared';
import { type QueryKey, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import * as React from 'react';

export const TASK_BOARD_PAGE_SIZE = 50;
export const TASK_BOARD_STATUS_COLUMNS: readonly TaskStatus[] = [
  'backlog',
  'todo',
  'doing',
  'review',
  'done',
  'released',
  'reopened',
];
/** Prefix of every board list cache; sits under `['tasks']` so shared invalidations reach it. */
export const TASK_BOARD_KEY = ['tasks', 'board'] as const;

export type TaskBoardScope = {
  managedSystem: string | undefined;
  q: string | undefined;
  publicUpdate: 'missing' | undefined;
};
/** Personal filters as GET /tasks tokens (comma lists); never part of the summary strip. */
export type TaskBoardServerFilters = {
  priority?: string;
  milestone_id?: string;
  assignee?: string;
};
/** Detail fallback membership, independent of status. Unknown server-only predicates stay unproven. */
export function taskMatchesBoardPopulation(
  task: TaskDto,
  scope: TaskBoardScope,
  filters: TaskBoardServerFilters,
): boolean {
  if (
    scope.managedSystem &&
    scope.managedSystem !== 'all' &&
    task.primary_managed_system_id !== scope.managedSystem
  )
    return false;
  // A detail DTO cannot establish linked VOC/public-update membership.
  if (scope.publicUpdate) return false;
  const q = scope.q?.toLowerCase();
  if (q && !task.title.toLowerCase().includes(q) && !task.display_id.toLowerCase().startsWith(q)) {
    return false;
  }
  if (filters.priority && !filters.priority.split(',').includes(task.priority)) return false;
  if (filters.assignee) {
    const tokens = filters.assignee.split(',');
    const unassigned = task.assignee_actor_id === null && task.assignee_team_id === null;
    if (
      !(tokens.includes('unassigned') && unassigned) &&
      !(task.assignee_actor_id && tokens.includes(task.assignee_actor_id))
    )
      return false;
  }
  if (filters.milestone_id) {
    const tokens = filters.milestone_id.split(',');
    if (
      !(tokens.includes('any') && task.milestone_id !== null) &&
      !(tokens.includes('none') && task.milestone_id === null) &&
      !(task.milestone_id && tokens.includes(task.milestone_id))
    )
      return false;
  }
  return true;
}

export type TaskBoardColumnId = TaskStatus | 'open';

function scopeParams(scope: TaskBoardScope) {
  return {
    ...(scope.q === undefined ? {} : { q: scope.q }),
    ...(scope.managedSystem === undefined ? {} : { managed_system_id: scope.managedSystem }),
    ...(scope.publicUpdate === 'missing' ? { public_update: scope.publicUpdate } : {}),
  };
}

export function taskBoardColumnKey(
  scope: TaskBoardScope,
  filters: TaskBoardServerFilters,
  status: TaskBoardColumnId,
): QueryKey {
  return [
    ...TASK_BOARD_KEY,
    {
      managedSystem: scope.managedSystem,
      q: scope.q,
      publicUpdate: scope.publicUpdate,
      filters,
      status,
    },
  ];
}

export function taskBoardColumnOptions(
  scope: TaskBoardScope,
  filters: TaskBoardServerFilters,
  status: TaskStatus,
) {
  const queryKey = taskBoardColumnKey(scope, filters, status);
  return {
    queryKey,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: ListTasksResponse) =>
      last.page?.has_more ? last.page.cursor : undefined,
    queryFn: ({ signal, pageParam }: { signal: AbortSignal; pageParam: string | undefined }) =>
      listTasks({
        signal,
        status,
        limit: TASK_BOARD_PAGE_SIZE,
        ...scopeParams(scope),
        ...filters,
        ...(pageParam === undefined ? {} : { cursor: pageParam }),
      }),
    staleTime: 30_000,
  };
}

const NO_TASKS: TaskDto[] = [];

function useBoardColumn(
  status: TaskStatus,
  scope: TaskBoardScope,
  filters: TaskBoardServerFilters,
  enabled: boolean,
) {
  const options = taskBoardColumnOptions(scope, filters, status);
  const query = useInfiniteQuery({
    ...options,
    enabled,
    placeholderData: (previousData, previousQuery) =>
      placeholderDataForSearchOnly(options.queryKey, previousData, previousQuery),
  });
  const items = React.useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? NO_TASKS,
    [query.data],
  );
  const total = query.data?.pages[0]?.page?.total;
  return { status, query, items, total };
}

/**
 * Status grouping: one infinite query per status column (fixed hook order, enabled only while
 * grouped by status). Other groupings: one unbounded request for the open set.
 */
export function useTaskBoardData({
  scope,
  filters,
  statusGrouping,
}: {
  scope: TaskBoardScope;
  filters: TaskBoardServerFilters;
  statusGrouping: boolean;
}) {
  const backlog = useBoardColumn('backlog', scope, filters, statusGrouping);
  const todo = useBoardColumn('todo', scope, filters, statusGrouping);
  const doing = useBoardColumn('doing', scope, filters, statusGrouping);
  const review = useBoardColumn('review', scope, filters, statusGrouping);
  const done = useBoardColumn('done', scope, filters, statusGrouping);
  const released = useBoardColumn('released', scope, filters, statusGrouping);
  const reopened = useBoardColumn('reopened', scope, filters, statusGrouping);
  const columns = [backlog, todo, doing, review, done, released, reopened] as const;
  const openKey = taskBoardColumnKey(scope, filters, 'open');
  const openSet = useQuery<ListTasksResponse>({
    queryKey: openKey,
    enabled: !statusGrouping,
    placeholderData: (previousData, previousQuery) =>
      placeholderDataForSearchOnly(openKey, previousData, previousQuery),
    queryFn: ({ signal }) =>
      listTasks({ signal, status_group: 'open', ...scopeParams(scope), ...filters }),
    staleTime: 30_000,
  });
  const openItems = openSet.data?.items ?? NO_TASKS;
  // Every Task the board has loaded, whichever grouping shows it.
  const loaded = React.useMemo(
    () =>
      statusGrouping
        ? [
            ...backlog.items,
            ...todo.items,
            ...doing.items,
            ...review.items,
            ...done.items,
            ...released.items,
            ...reopened.items,
          ]
        : openItems,
    [
      statusGrouping,
      backlog.items,
      todo.items,
      doing.items,
      review.items,
      done.items,
      released.items,
      reopened.items,
      openItems,
    ],
  );
  return { columns, openSet, openItems, openKey, loaded };
}

/** Operational totals: board scope and `q` only, never the personal filters. */
export type TaskBoardSummaryKind = 'all' | 'unassigned' | 'doing';

function useBoardSummary(kind: TaskBoardSummaryKind, scope: TaskBoardScope) {
  const queryKey = [
    'tasks',
    'board-summary',
    {
      managedSystem: scope.managedSystem,
      q: scope.q,
      publicUpdate: scope.publicUpdate,
      kind,
    },
  ] as const;
  const query = useQuery<ListTasksResponse>({
    queryKey,
    placeholderData: (previousData, previousQuery) =>
      placeholderDataForSearchOnly(queryKey, previousData, previousQuery),
    queryFn: ({ signal }) =>
      listTasks({
        signal,
        limit: 1,
        ...(kind === 'unassigned' ? { assignee: 'unassigned' } : {}),
        ...(kind === 'doing' ? { status: 'doing' as const } : {}),
        ...scopeParams(scope),
      }),
    staleTime: 30_000,
  });
  return query.data?.page?.total;
}

export function useTaskBoardSummary(scope: TaskBoardScope) {
  return {
    all: useBoardSummary('all', scope),
    unassigned: useBoardSummary('unassigned', scope),
    doing: useBoardSummary('doing', scope),
  };
}
