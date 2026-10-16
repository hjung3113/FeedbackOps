import { ListStateMessage } from '@/components/ListStateMessage';
import { mapUnknownError } from '@/lib/api/errorMapper';
import { listMilestones } from '@/lib/api/milestones';
import { getTask } from '@/lib/api/tasks';
import { ApiError, isPermissionDenied } from '@/lib/api/types';
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from '@/lib/copy/enum-labels';
import { LIST_SEARCH_EMPTY_LABEL, LIST_SEARCH_PLACEHOLDER } from '@/lib/copy/list-search';
import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import { TASK_BOARD_COPY } from '@/lib/copy/task-board';
import {
  TASK_REPORT_FILTER_COPY as FILTER_COPY,
  TASK_LINK_MISSING_MESSAGE,
} from '@/lib/copy/tasks';
import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import { formatCount } from '@/lib/format/count';
import { useCommittedSearchDraft } from '@/lib/useCommittedSearchDraft';
import {
  type Announcements,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  type DropAnimation,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { type TaskDto, type TaskStatus, taskPrioritySchema } from '@fops/shared';
import {
  ActiveFilterBar,
  ListFilterButton,
  OutlineBadge,
  PermissionBlockedPanel,
  SearchInput,
  WorkbenchShell,
  readMotionTiming,
} from '@fops/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import * as React from 'react';
import {
  resolveTaskAssignee,
  taskTeamLabel,
  useTaskManagedSystemNames,
  useTaskTeamNames,
} from '../adapters/taskDisplayAdapters';
import { LinkTargetMissingNotice } from '../components/LinkTargetMissingNotice';
import { TaskDetailPanel } from '../components/TaskDetailPanel';
import { TaskBoardCardPreview } from '../components/task-board/TaskBoardCard';
import { TaskBoardColumn } from '../components/task-board/TaskBoardColumn';
import {
  type TaskBoardGroupBy,
  TaskBoardGroupByButton,
} from '../components/task-board/TaskBoardGroupByButton';
import { useTaskBoardDragGeometry } from '../components/task-board/useTaskBoardDragGeometry';
import {
  type TaskBoardServerFilters,
  taskBoardColumnKey,
  taskBoardColumnOptions,
  taskMatchesBoardPopulation,
  useTaskBoardData,
  useTaskBoardSummary,
} from '../hooks/useTaskBoardData';
import { useTaskBoardKeyboardFocus } from '../hooks/useTaskBoardKeyboardFocus';
import { useTaskPanelSelection } from '../hooks/useTaskPanelSelection';
import { useTaskStatusTransition } from '../hooks/useTaskStatusTransition';

// Never auto-select: the board opens a card only from the URL or a click.
const NO_AUTO_SELECT: readonly { id: string }[] = [];
const SELECTION_LIMIT = 20;
function preventKeyboardArrowDefault(event: KeyboardEvent) {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.code)) {
    event.preventDefault();
  }
}

function TaskBoardDndContext({
  onDragStart,
  onDragEnd,
  onDragCancel,
  ...props
}: React.ComponentProps<typeof DndContext>) {
  const [keyboardDragActive, setKeyboardDragActive] = React.useState(false);
  React.useEffect(() => {
    if (!keyboardDragActive) return;
    document.addEventListener('keydown', preventKeyboardArrowDefault);
    return () => document.removeEventListener('keydown', preventKeyboardArrowDefault);
  }, [keyboardDragActive]);
  return (
    <DndContext
      {...props}
      onDragStart={(event) => {
        setKeyboardDragActive(event.activatorEvent instanceof KeyboardEvent);
        onDragStart?.(event);
      }}
      onDragEnd={(event) => {
        setKeyboardDragActive(false);
        onDragEnd?.(event);
      }}
      onDragCancel={(event) => {
        setKeyboardDragActive(false);
        onDragCancel?.(event);
      }}
    />
  );
}

type Filters = Record<string, string[]>;

function groupValue(task: TaskDto, groupBy: TaskBoardGroupBy): string {
  if (groupBy === 'priority') return task.priority;
  if (groupBy === 'managedSystem') return task.primary_managed_system_id;
  if (groupBy === 'assignee')
    return (
      task.assignee_actor_id ??
      (task.assignee_team_id ? `team:${task.assignee_team_id}` : '__unassigned')
    );
  return task.status;
}

const FILTER_TOKENS: Record<string, string> = {
  __any: 'any',
  __none: 'none',
  __unassigned: 'unassigned',
};

// Filter checkboxes -> GET /tasks tokens. The popup values stay React state, not URL state.
function toServerFilters(filters: Filters): TaskBoardServerFilters {
  const list = (key: string) =>
    (filters[key] ?? []).map((value) => FILTER_TOKENS[value] ?? value).join(',');
  const priority = list('priority');
  const milestone = list('milestone');
  const assignee = list('assignee');
  return {
    ...(priority === '' ? {} : { priority }),
    ...(milestone === '' ? {} : { milestone_id: milestone }),
    ...(assignee === '' ? {} : { assignee }),
  };
}

export function TaskBoardRoute({
  selectedParam,
  managedSystem,
  publicUpdate,
  q,
}: {
  q?: string;
  selectedParam?: string;
  managedSystem?: string;
  publicUpdate?: 'missing';
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const writeSearch = React.useCallback(
    (draft: string) => {
      const next = draft.trim();
      if (next === (q ?? '')) return false;
      void navigate({
        to: '/tasks',
        replace: true,
        search: ({ q: _q, ...previous }) => ({
          ...previous,
          ...(next === '' ? {} : { q: next }),
        }),
      });
      return true;
    },
    [navigate, q],
  );
  const { draft, setDraft, commit } = useCommittedSearchDraft({
    committed: q ?? '',
    write: writeSearch,
  });
  const [activeTask, setActiveTask] = React.useState<TaskDto | null>(null);
  const [dropAnimation, setDropAnimation] = React.useState<DropAnimation | null>(null);
  const geometry = useTaskBoardDragGeometry();
  const { boardScroller } = geometry;
  const keyboardTiming = readMotionTiming('fast', 'standard');
  // dnd-kit supports null at runtime, but its transition type omits it.
  const overlayTransition = (
    keyboardTiming.durationMs === 0
      ? null
      : `transform ${keyboardTiming.durationMs}ms ${keyboardTiming.easing}`
  ) as string;
  const [groupBy, setGroupBy] = React.useState<TaskBoardGroupBy>('status');
  const [filters, setFilters] = React.useState<Filters>({});
  const [milestoneScope, setMilestoneScope] = React.useState(managedSystem);
  // Milestone choices are scope-bound: a held exact choice does not survive a scope change.
  if (milestoneScope !== managedSystem) {
    setMilestoneScope(managedSystem);
    if (filters.milestone?.some((value) => !(value in FILTER_TOKENS))) {
      const kept = filters.milestone.filter((value) => value in FILTER_TOKENS);
      const { milestone: _milestone, ...rest } = filters;
      setFilters(kept.length > 0 ? { ...rest, milestone: kept } : rest);
    }
  }
  const serverFilters = React.useMemo(() => toServerFilters(filters), [filters]);
  const filtersKey = JSON.stringify(serverFilters);
  const hasPersonalFilters = filtersKey !== '{}';
  const statusGrouping = groupBy === 'status';
  const scope = React.useMemo(
    () => ({ managedSystem, q, publicUpdate }),
    [managedSystem, q, publicUpdate],
  );
  const data = useTaskBoardData({ scope, filters: serverFilters, statusGrouping });
  const summary = useTaskBoardSummary(scope);
  const caches = React.useMemo(
    () =>
      statusGrouping
        ? ({
            mode: 'status',
            includesFallback: (task: TaskDto) =>
              taskMatchesBoardPopulation(task, scope, serverFilters),
            columnKey: (status: TaskStatus) => taskBoardColumnKey(scope, serverFilters, status),
            ensureColumn: (status: TaskStatus) =>
              queryClient.ensureInfiniteQueryData(
                taskBoardColumnOptions(scope, serverFilters, status),
              ),
          } as const)
        : ({ mode: 'open', openKey: data.openKey } as const),
    [statusGrouping, scope, serverFilters, queryClient, data.openKey],
  );
  const mutation = useTaskStatusTransition(
    caches,
    JSON.stringify({ groupBy, ...scope, filters: serverFilters }),
  );
  const { actors } = useWorkspaceActors();
  const systemNames = useTaskManagedSystemNames();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: geometry.coordinateGetter,
      scrollBehavior: 'auto',
    }),
  );
  const actorNames = React.useMemo(
    () => new Map((actors ?? []).map((a) => [a.id, a.display_name])),
    [actors],
  );
  const items = data.loaded;
  const teamNames = useTaskTeamNames(items);

  // Selection: URL param or a click only (no first-item auto-selection); a Task that no loaded
  // page contains resolves through GET /tasks/:id.
  const boardSearch = React.useCallback(
    (param?: string) => ({
      view: 'board' as const,
      ...(q === undefined ? {} : { q }),
      ...(managedSystem === undefined ? {} : { managedSystem }),
      ...(param !== undefined ? { param } : {}),
      ...(publicUpdate === 'missing' ? { public_update: publicUpdate } : {}),
    }),
    [q, managedSystem, publicUpdate],
  );
  const onSelectionChange = React.useCallback(
    (id: string | null, replace: boolean) => {
      if (id !== null) {
        void navigate({ to: '/tasks', search: boardSearch(id) });
        return;
      }
      void navigate({
        to: '/tasks',
        replace,
        search: ({ param: _param, ...previous }) => previous,
      });
    },
    [navigate, boardSearch],
  );
  const { selectedId, linkMissing, selectRow, closePanel, markLinkMissing } = useTaskPanelSelection(
    {
      selectedParam,
      items: NO_AUTO_SELECT,
      context: ['board', managedSystem],
      onSelectionChange,
    },
  );
  const detailQuery = useQuery({
    queryKey: ['task', selectedId],
    queryFn: ({ signal }) => getTask(selectedId as string, signal),
    enabled: selectedId !== null,
    staleTime: 30_000,
    retry: false,
  });
  React.useEffect(() => {
    const detail = detailQuery.data;
    const outOfScope =
      detail !== undefined &&
      detail.id === selectedId &&
      managedSystem !== undefined &&
      managedSystem !== 'all' &&
      detail.primary_managed_system_id !== managedSystem;
    if ((detailQuery.error instanceof ApiError && detailQuery.error.status === 404) || outOfScope) {
      markLinkMissing();
    }
  }, [detailQuery.data, detailQuery.error, selectedId, managedSystem, markLinkMissing]);

  const focusScope = React.useMemo(
    () => ({ groupBy, managedSystem, publicUpdate, q, filters: filtersKey }),
    [groupBy, managedSystem, publicUpdate, q, filtersKey],
  );
  const queryStates = statusGrouping ? data.columns.map((column) => column.query) : [data.openSet];
  const anyFetching = queryStates.some((query) => query.isFetching);
  const keyboardFocus = useTaskBoardKeyboardFocus({
    scope: focusScope,
    tasks: items,
    boardScroller,
    isFetching: anyFetching,
    isReconciling: mutation.isReconciling,
  });
  // Retained route state and its resets. Scope, grouping or filter changes drop everything that
  // belongs to a gesture: the dragged copy, its drop animation, the tracked column and the
  // pickup announcement. The selection follows the URL (useTaskPanelSelection), mutation tokens
  // live with the transition hook for the route's lifetime so late rejections stay guarded, and
  // pending focus recovery clears in useTaskBoardKeyboardFocus.
  const pickupColumn = React.useRef<TaskStatus | null>(null);
  const { reset: resetGeometry } = geometry;
  const resetScope = [managedSystem, publicUpdate, q, groupBy, filtersKey].join('\u0000');
  const lastResetScope = React.useRef(resetScope);
  React.useEffect(() => {
    if (lastResetScope.current === resetScope) return;
    lastResetScope.current = resetScope;
    setActiveTask(null);
    setDropAnimation(null);
    pickupColumn.current = null;
    resetGeometry();
  }, [resetScope, resetGeometry]);

  const columns = React.useMemo(() => {
    if (groupBy === 'status') {
      return data.columns.map((column) => ({
        key: column.status as string,
        label: TASK_STATUS_LABELS[column.status],
      }));
    }
    if (groupBy === 'priority') {
      return [...taskPrioritySchema.options].reverse().map((key) => ({
        key: key as string,
        label: TASK_PRIORITY_LABELS[key],
      }));
    }
    if (groupBy === 'managedSystem')
      return [...systemNames].map(([key, label]) => ({ key, label }));
    return [
      ...new Set(
        items
          .map(
            (t) =>
              t.assignee_actor_id ?? (t.assignee_team_id ? `team:${t.assignee_team_id}` : null),
          )
          .filter((id): id is string => id !== null),
      ),
    ]
      .map((key) => ({
        key,
        label: key.startsWith('team:')
          ? taskTeamLabel(key.slice(5), teamNames)
          : (actorNames.get(key) ?? key),
      }))
      .concat({ key: '__unassigned', label: '미배정' });
  }, [actorNames, teamNames, items, groupBy, systemNames, data.columns]);

  const milestoneChoices = useQuery({
    queryKey: ['milestones', 'board-options', managedSystem ?? null] as const,
    queryFn: ({ signal }) =>
      listMilestones({
        signal,
        ...(managedSystem !== undefined ? { managed_system_id: managedSystem } : {}),
      }),
    staleTime: 30_000,
  });
  const filterCategories = React.useMemo(
    () => [
      {
        key: 'priority',
        label: '우선순위',
        options: [...taskPrioritySchema.options].reverse().map((value) => ({
          value,
          label: TASK_PRIORITY_LABELS[value],
        })),
      },
      {
        key: 'milestone',
        label: 'Milestone',
        options: [
          { value: '__any', label: 'Milestone 있음' },
          { value: '__none', label: 'Milestone 없음' },
          // A settled read error hides retained choices.
          ...(milestoneChoices.isError
            ? []
            : (milestoneChoices.data?.items ?? []).map((milestone) => ({
                value: milestone.id,
                label: `${milestone.display_id} ${milestone.title}`,
              }))),
        ],
      },
      {
        key: 'assignee',
        label: '담당자',
        options: [
          { value: '__unassigned', label: '미배정' },
          ...(actors ?? []).map((actor) => ({ value: actor.id, label: actor.display_name })),
        ],
      },
    ],
    [actors, milestoneChoices.data, milestoneChoices.isError],
  );
  function changeFilters(next: Filters) {
    const bounded: Filters = {};
    for (const [key, values] of Object.entries(next)) {
      // An over-long selection keeps the previous values rather than failing every request.
      bounded[key] = values.length > SELECTION_LIMIT ? (filters[key] ?? []) : values;
      if (bounded[key]?.length === 0) delete bounded[key];
    }
    setFilters(bounded);
  }
  function dropPublicUpdate() {
    void navigate({
      to: '/tasks',
      search: ({ public_update: _publicUpdate, ...previous }) => previous,
    });
  }
  const announcements = React.useMemo<Announcements>(() => {
    const taskFor = (active: Parameters<Announcements['onDragStart']>[0]['active']) =>
      active.data.current?.task as TaskDto | undefined;
    const displayId = (active: Parameters<Announcements['onDragStart']>[0]['active']) =>
      taskFor(active)?.display_id ?? String(active.id);
    const columnLabel = (over: Parameters<Announcements['onDragOver']>[0]['over']) =>
      over ? TASK_STATUS_LABELS[over.id as TaskStatus] : null;
    return {
      onDragStart: ({ active }) => {
        const task = taskFor(active);
        pickupColumn.current = task?.status ?? null;
        return TASK_BOARD_COPY.pickup(
          displayId(active),
          task ? TASK_STATUS_LABELS[task.status] : String(active.id),
        );
      },
      onDragOver: ({ active, over }) => {
        if (pickupColumn.current !== null && over?.id === pickupColumn.current) return undefined;
        if (over && over.id !== pickupColumn.current) pickupColumn.current = null;
        return TASK_BOARD_COPY.over(displayId(active), columnLabel(over));
      },
      onDragEnd: ({ active, over }) => TASK_BOARD_COPY.drop(displayId(active), columnLabel(over)),
      onDragCancel: ({ active }) => TASK_BOARD_COPY.cancel(displayId(active)),
    };
  }, []);
  function onDragStart(event: DragStartEvent) {
    keyboardFocus.startDrag();
    geometry.onDragStart(event);
    const timing = readMotionTiming('slow', 'enter');
    setDropAnimation(
      timing.durationMs === 0 ? null : { duration: timing.durationMs, easing: timing.easing },
    );
    setActiveTask((event.active.data.current?.task as TaskDto | undefined) ?? null);
  }
  function onDragEnd(event: DragEndEvent) {
    geometry.onDragEnd();
    const task = event.active.data.current?.task as TaskDto | undefined;
    const target = event.over?.id;
    const willMove =
      groupBy === 'status' && task && typeof target === 'string' && task.status !== target;
    const timing = readMotionTiming('slow', 'enter');
    // dnd-kit reads this state in its layout effect after the end-event commit.
    setDropAnimation(
      willMove || timing.durationMs === 0
        ? null
        : { duration: timing.durationMs, easing: timing.easing },
    );
    setActiveTask(null);
    if (willMove) {
      const recoverRejection =
        event.activatorEvent instanceof KeyboardEvent
          ? keyboardFocus.requestMove(task.id, target as TaskStatus)
          : null;
      // Per-invocation promises also settle when a newer mutation supersedes this one.
      void mutation.mutateAsync({ task, status: target as TaskStatus }).catch(() => {
        recoverRejection?.();
      });
    }
  }
  const selected =
    !linkMissing && selectedId
      ? (items.find((item) => item.id === selectedId) ?? detailQuery.data ?? null)
      : null;
  function moveToNextStatus(taskId: string) {
    const task =
      items.find((item) => item.id === taskId) ??
      (detailQuery.data?.id === taskId ? detailQuery.data : undefined);
    const nextStatus: Partial<Record<TaskStatus, TaskStatus>> = {
      backlog: 'todo',
      todo: 'doing',
      doing: 'review',
      review: 'done',
      done: 'released',
      reopened: 'todo',
    };
    const next = task && nextStatus[task.status];
    if (task && next) {
      keyboardFocus.replaceTask(taskId);
      mutation.mutate({ task, status: next });
    }
  }

  const states = queryStates.map((query) => ({
    query,
    pending: query.isPending,
    errored: query.isError && query.data === undefined,
  }));
  const deniedError = states
    .map(({ query }) => query.error)
    .find((error) => isPermissionDenied(error));
  if (deniedError) {
    return (
      <PermissionBlockedPanel
        state="denied"
        category="Task board"
        reason={PERMISSION_BLOCKED_REASONS.taskList}
        className="m-4"
      />
    );
  }
  const boardLoading = states.every(({ pending }) => pending);
  const boardError = states.every(({ errored }) => errored);
  const firstError = states.find(({ errored }) => errored)?.query.error;
  const settled = queryStates.every(
    (query) =>
      query.isSuccess &&
      (!query.isFetching || ('isFetchingNextPage' in query && query.isFetchingNextPage)),
  );
  const totalCount = statusGrouping
    ? data.columns.every((column) => column.total !== undefined)
      ? data.columns.reduce((sum, column) => sum + (column.total ?? 0), 0)
      : undefined
    : data.openSet.isSuccess
      ? data.openItems.length
      : undefined;
  const boardEmpty = settled && totalCount === 0 && !hasPersonalFilters;
  const activeAssignee = activeTask
    ? resolveTaskAssignee(activeTask.assignee_actor_id, actorNames)
    : null;
  const activeFilters =
    publicUpdate === 'missing'
      ? [{ key: 'public_update', label: FILTER_COPY.publicUpdate, onRemove: dropPublicUpdate }]
      : [];
  return (
    <WorkbenchShell
      toolbar={{
        title: (
          <span className="flex items-center gap-2">
            보드
            {settled && totalCount !== undefined ? (
              <OutlineBadge>{formatCount(totalCount)}</OutlineBadge>
            ) : null}
          </span>
        ),
        actions: (
          <>
            <span className="text-xs text-text-muted">
              Task는 Task Request에서 전환됩니다.{' '}
              <Link
                to="/tasks"
                search={{
                  view: 'requests',
                  ...(managedSystem !== undefined ? { managedSystem } : {}),
                }}
                className="font-medium underline underline-offset-2 hover:text-text-secondary"
              >
                Task Request 검토
              </Link>
            </span>
            <SearchInput
              placeholder={LIST_SEARCH_PLACEHOLDER}
              value={draft}
              onValueChange={setDraft}
              onCommit={commit}
            />
            <ListFilterButton
              categories={filterCategories}
              values={filters}
              onChange={changeFilters}
            />
            <TaskBoardGroupByButton value={groupBy} onChange={setGroupBy} />
          </>
        ),
      }}
      detailPanel={
        linkMissing ? (
          <LinkTargetMissingNotice message={TASK_LINK_MISSING_MESSAGE} />
        ) : isPermissionDenied(detailQuery.error) ? (
          <PermissionBlockedPanel
            state="denied"
            category="Task detail"
            reason={PERMISSION_BLOCKED_REASONS.taskDetail}
            className="m-4"
          />
        ) : selected ? (
          <TaskDetailPanel
            taskId={selected.id}
            actorNamesById={actorNames}
            managedSystemNamesById={systemNames}
            view="board"
            hasActionFooter={selected.status !== 'released'}
            onMoveToNextStatus={moveToNextStatus}
            onClose={closePanel}
          />
        ) : null
      }
    >
      <div
        aria-live={boardLoading || boardError ? 'polite' : 'off'}
        className="flex h-full min-h-0 flex-col"
      >
        {boardLoading ? (
          <div className="p-4 text-sm text-text-muted">Task 불러오는 중...</div>
        ) : boardError ? (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            <ListStateMessage
              variant="error"
              title="Task 보드를 불러오지 못했습니다."
              body={mapUnknownError(firstError).message}
              action={{
                label: '다시 시도',
                onClick: () => {
                  for (const { query } of states) void query.refetch();
                },
              }}
            />
          </div>
        ) : (
          <>
            {!statusGrouping ? (
              <p className="border-b border-border-subtle px-5 py-1.5 text-xs text-text-muted">
                {TASK_BOARD_COPY.openOnlyNote}
              </p>
            ) : null}
            <ActiveFilterBar
              items={activeFilters}
              onClearAll={dropPublicUpdate}
              className="mx-5 my-2"
            />
            <div className="flex items-stretch gap-4 border-b border-border-subtle bg-surface-canvas px-5 py-2.5">
              <StatBlock label="전체 Task" value={summary.all} />
              <StatDivider />
              <StatBlock
                label="미배정"
                value={summary.unassigned}
                valueClassName="text-accent-warn"
              />
              <StatDivider />
              <StatBlock
                label="진행 중"
                value={summary.doing}
                valueClassName="text-accent-success"
              />
            </div>
            {boardEmpty && q ? (
              <ListStateMessage
                variant="filtered"
                title={LIST_SEARCH_EMPTY_LABEL}
                action={{ label: '검색 초기화', onClick: () => writeSearch('') }}
              />
            ) : boardEmpty ? (
              <output className="flex flex-1 items-center justify-center p-6">
                <p className="text-sm text-text-muted">
                  Task는 Task Request에서 전환됩니다.{' '}
                  <Link
                    to="/tasks"
                    search={{
                      view: 'requests',
                      ...(managedSystem !== undefined ? { managedSystem } : {}),
                    }}
                    className="font-medium underline underline-offset-2 hover:text-text-secondary"
                  >
                    Task Request 검토
                  </Link>
                </p>
              </output>
            ) : (
              <TaskBoardDndContext
                sensors={sensors}
                accessibility={{
                  announcements,
                  restoreFocus: false,
                  screenReaderInstructions: TASK_BOARD_COPY.screenReaderInstructions,
                }}
                autoScroll={geometry.autoScroll}
                measuring={geometry.measuring}
                collisionDetection={geometry.collisionDetection}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDragCancel={() => {
                  geometry.onDragEnd();
                  keyboardFocus.cancelDrag();
                  setActiveTask(null);
                }}
              >
                <div ref={boardScroller} className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
                  {columns.map((column, index) => {
                    const source = statusGrouping ? data.columns[index] : undefined;
                    const query = source?.query;
                    const state =
                      query === undefined || query.data !== undefined
                        ? 'ready'
                        : query.isError
                          ? 'error'
                          : 'loading';
                    return (
                      <TaskBoardColumn
                        key={column.key}
                        id={column.key}
                        label={column.label}
                        tasks={
                          source
                            ? source.items
                            : items.filter((task) => groupValue(task, groupBy) === column.key)
                        }
                        {...(source
                          ? { total: source.total ?? (state === 'ready' ? undefined : null) }
                          : {})}
                        state={state}
                        {...(query
                          ? {
                              paging: {
                                hasMore: query.hasNextPage,
                                loadingMore: query.isFetchingNextPage,
                                failed: query.isFetchNextPageError,
                                onLoadMore: () => void query.fetchNextPage(),
                              },
                              onRetry: () => void query.refetch(),
                            }
                          : {})}
                        groupBy={groupBy}
                        selectedId={selectedId}
                        selectTask={selectRow}
                        names={{ systems: systemNames, actors: actorNames, teams: teamNames }}
                        enabled={statusGrouping}
                      />
                    );
                  })}
                </div>
                <DragOverlay dropAnimation={dropAnimation} transition={overlayTransition}>
                  {activeTask && (
                    <TaskBoardCardPreview
                      task={activeTask}
                      selected={activeTask.id === selectedId}
                      managedSystemName={
                        systemNames.get(activeTask.primary_managed_system_id) ?? 'Managed System'
                      }
                      assigneeName={
                        activeTask.assignee_team_id
                          ? taskTeamLabel(activeTask.assignee_team_id, teamNames)
                          : activeAssignee?.kind === 'resolved'
                            ? activeAssignee.displayName
                            : undefined
                      }
                    />
                  )}
                </DragOverlay>
              </TaskBoardDndContext>
            )}
          </>
        )}
      </div>
    </WorkbenchShell>
  );
}

function StatBlock({
  label,
  value,
  valueClassName = '',
}: { label: string; value: number | undefined; valueClassName?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-text-muted">{label}</span>
      <span className={`text-base font-semibold tabular-nums ${valueClassName}`}>
        {value ?? '—'}
      </span>
    </div>
  );
}

function StatDivider() {
  return <div className="w-px self-stretch bg-border-subtle" aria-hidden="true" />;
}
