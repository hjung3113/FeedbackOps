import { ListLoadMore } from '@/components/ListLoadMore';
import { ListStateMessage } from '@/components/ListStateMessage';
import { getTask, listTasks } from '@/lib/api';
import { ApiError, isPermissionDenied } from '@/lib/api/types';
import { useMe } from '@/lib/auth/useMe';
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from '@/lib/copy/enum-labels';
import { GLOSSARY } from '@/lib/copy/glossary';
import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import {
  TASK_REPORT_FILTER_COPY as FILTER_COPY,
  TASK_LINK_MISSING_MESSAGE,
} from '@/lib/copy/tasks';
import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import { formatCount } from '@/lib/format/count';
import { formatShortDateTime } from '@/lib/format/datetime';
import { useAnalyticsAreaFilterLabel } from '@/lib/useAnalyticsAreaFilterLabel';
import type { ListTasksResponse, TaskStatus } from '@fops/shared';
import {
  ActiveFilterBar,
  InternalTaskBadge,
  ListShell,
  ObjectRow,
  OutlineBadge,
  PermissionBlockedPanel,
  UnassignedBadge,
} from '@fops/ui';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import * as React from 'react';
import {
  resolveTaskAssignee,
  taskPriorityToSeverity,
  taskTeamMark,
  useTaskManagedSystemNames,
  useTaskTeamNames,
} from '../adapters/taskDisplayAdapters';
import { LinkTargetMissingNotice } from '../components/LinkTargetMissingNotice';
import { TaskDetailPanel } from '../components/TaskDetailPanel';
import { useCloseFocusReturn } from '../hooks/useCloseFocusReturn';
import { useTaskPanelSelection } from '../hooks/useTaskPanelSelection';

const PAGE_SIZE = 50;
const FILTER_KEYS = [
  'filter.analytics_area',
  'status',
  'status_group',
  'overdue',
  'public_update',
  'reporter_update',
] as const;

export type TaskListFilters = {
  'filter.analytics_area'?: string | undefined;
  status?: TaskStatus | undefined;
  status_group?: 'in-flight' | undefined;
  overdue?: true | undefined;
  public_update?: 'missing' | undefined;
  reporter_update?: 'needed' | undefined;
};

function dot() {
  return <span className="h-1 w-1 rounded-full bg-text-muted/60" aria-hidden="true" />;
}

export function TaskListRoute({
  view = 'backlog',
  selectedParam,
  managedSystem,
  filters = {},
}: {
  view?: 'my' | 'backlog';
  selectedParam?: string | undefined;
  managedSystem?: string;
  filters?: TaskListFilters;
}) {
  const navigate = useNavigate();
  const { rowRef, returnFocus, cancel } = useCloseFocusReturn(
    JSON.stringify([view, managedSystem ?? null]),
  );
  const onSelectionChange = React.useCallback(
    (id: string | null, replace: boolean) => {
      void navigate({
        to: '/tasks',
        replace,
        search: (previous) => {
          if (id !== null) return { ...previous, view, param: id };
          const { param: _param, ...rest } = previous;
          return rest;
        },
      });
    },
    [navigate, view],
  );
  const wireFilters = {
    ...(filters['filter.analytics_area'] === undefined
      ? {}
      : { analytics_area_id: filters['filter.analytics_area'] }),
    ...(filters.status === undefined ? {} : { status: filters.status }),
    ...(filters.status_group === undefined ? {} : { status_group: filters.status_group }),
    ...(filters.overdue === undefined ? {} : { overdue: 'true' as const }),
    ...(filters.public_update === undefined ? {} : { public_update: filters.public_update }),
    ...(filters.reporter_update === undefined ? {} : { reporter_update: filters.reporter_update }),
  };
  const areaLabel = useAnalyticsAreaFilterLabel(filters['filter.analytics_area'], managedSystem);
  const removeFilters = (keys: readonly (keyof TaskListFilters)[]) => {
    void navigate({
      to: '/tasks',
      search: (previous) => {
        const next = { ...previous };
        for (const key of keys) delete next[key];
        return next;
      },
    });
  };
  const labels = {
    'filter.analytics_area': areaLabel,
    status:
      filters.status === undefined ? '' : FILTER_COPY.status(TASK_STATUS_LABELS[filters.status]),
    status_group: FILTER_COPY.inFlight,
    overdue: FILTER_COPY.overdue,
    public_update: FILTER_COPY.publicUpdate,
    reporter_update: FILTER_COPY.reporterUpdate,
  };
  const activeFilters = FILTER_KEYS.flatMap((key) =>
    filters[key] === undefined
      ? []
      : [{ key, label: labels[key], onRemove: () => removeFilters([key]) }],
  );
  const tasksQuery = useInfiniteQuery({
    queryKey: ['tasks', view, managedSystem, 'pages', wireFilters] as const,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: ListTasksResponse) =>
      last.page?.has_more ? last.page.cursor : undefined,
    queryFn: ({ signal, pageParam }) =>
      listTasks({
        signal,
        limit: PAGE_SIZE,
        ...wireFilters,
        ...(pageParam === undefined ? {} : { cursor: pageParam }),
        ...(view === 'my' ? { assignee: 'me' } : {}),
        ...(managedSystem !== undefined ? { managed_system_id: managedSystem } : {}),
      }),
    staleTime: 30 * 1000,
  });
  const { actors } = useWorkspaceActors();
  const managedSystemNamesById = useTaskManagedSystemNames();
  const items = React.useMemo(
    () => tasksQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [tasksQuery.data],
  );
  const teamNames = useTaskTeamNames(items);
  const { selectedId, linkMissing, selectRow, closePanel, markLinkMissing } = useTaskPanelSelection(
    {
      selectedParam,
      items,
      context: [view, JSON.stringify([managedSystem, wireFilters])],
      onSelectionChange,
    },
  );
  const total = tasksQuery.data?.pages[0]?.page?.total;
  const me = useMe();
  const detailQuery = useQuery({
    queryKey: ['task', selectedId],
    queryFn: ({ signal }) => getTask(selectedId as string, signal),
    enabled: selectedId !== null,
    staleTime: 30_000,
    retry: false,
  });
  const actorNamesById = React.useMemo(
    () => new Map((actors ?? []).map((actor) => [actor.id, actor.display_name])),
    [actors],
  );

  // #1032: a new selection (row click or URL param) cancels a pending focus return.
  React.useEffect(() => {
    if (selectedId !== null) cancel();
  }, [selectedId, cancel]);

  const selected =
    !linkMissing && selectedId
      ? (items.find((item) => item.id === selectedId) ?? detailQuery.data ?? null)
      : null;
  React.useEffect(() => {
    const item = detailQuery.data;
    const filteredOut =
      item !== undefined &&
      item.id === selectedId &&
      ((managedSystem !== undefined &&
        managedSystem !== 'all' &&
        item.primary_managed_system_id !== managedSystem) ||
        (view === 'my' && me.data !== undefined && item.assignee_actor_id !== me.data.actor.id));
    if (
      (detailQuery.error instanceof ApiError && detailQuery.error.status === 404) ||
      filteredOut
    ) {
      markLinkMissing();
    }
  }, [
    detailQuery.data,
    detailQuery.error,
    selectedId,
    managedSystem,
    view,
    me.data,
    markLinkMissing,
  ]);

  if (tasksQuery.isLoading) {
    return <div className="p-4 text-sm text-text-muted">Task를 불러오는 중…</div>;
  }
  if (isPermissionDenied(tasksQuery.error)) {
    return (
      <PermissionBlockedPanel
        state="denied"
        category="Task 목록"
        reason={PERMISSION_BLOCKED_REASONS.taskList}
        className="m-4"
      />
    );
  }
  if (tasksQuery.error && !tasksQuery.isFetchNextPageError) {
    return (
      <ListStateMessage
        variant="error"
        title="Task 목록을 불러오지 못했습니다"
        body="잠시 후 다시 시도하세요."
        action={{ label: '다시 시도', onClick: () => void tasksQuery.refetch() }}
      />
    );
  }

  // #682 owner decision sets title/count and empty copy within the prototype Tasks list.
  return (
    <ListShell
      toolbar={{
        title: (
          <span className="flex items-center gap-2">
            {view === 'my' ? '내 Task' : 'Tasks'}
            {total !== undefined ? <OutlineBadge>{formatCount(total)}</OutlineBadge> : null}
          </span>
        ),
      }}
      list={
        <>
          <ActiveFilterBar
            items={activeFilters}
            onClearAll={() => removeFilters(FILTER_KEYS)}
            className="mx-5 my-2"
          />
          {items.map((task) => {
            const assignee = resolveTaskAssignee(task.assignee_actor_id, actorNamesById);
            return (
              <ObjectRow
                key={task.id}
                ref={rowRef(task.id)}
                id={task.display_id}
                title={task.title}
                selected={selected?.id === task.id}
                density="default"
                severity={taskPriorityToSeverity(task.priority)}
                onClick={() => selectRow(task.id)}
                badges={<InternalTaskBadge status={task.status} />}
                meta={
                  <>
                    <span>{TASK_PRIORITY_LABELS[task.priority]}</span>
                    {dot()}
                    <span>
                      {task.assignee_actor_id ? (
                        assignee.kind === 'resolved' ? (
                          assignee.displayName
                        ) : (
                          GLOSSARY.unknownUser
                        )
                      ) : task.assignee_team_id ? (
                        taskTeamMark(task.assignee_team_id, teamNames)
                      ) : (
                        <UnassignedBadge />
                      )}
                    </span>
                    {dot()}
                    <span>
                      {managedSystemNamesById.get(task.primary_managed_system_id) ??
                        'Managed System'}
                    </span>
                    {dot()}
                    <span>{formatShortDateTime(task.updated_at)}</span>
                  </>
                }
              />
            );
          })}
          <ListLoadMore
            hasMore={tasksQuery.hasNextPage}
            loadingMore={tasksQuery.isFetchingNextPage}
            failed={tasksQuery.isFetchNextPageError}
            onLoadMore={() => void tasksQuery.fetchNextPage()}
          />
          {items.length === 0 &&
            (activeFilters.length > 0 ? (
              <ListStateMessage
                variant="filtered"
                title={FILTER_COPY.empty}
                body={activeFilters.map((filter) => filter.label).join(' · ')}
              />
            ) : view === 'my' ? (
              <ListStateMessage variant="empty" title="나에게 배정된 Task가 없습니다." />
            ) : (
              <ListStateMessage
                variant="empty"
                title="Task가 없습니다."
                body="생성된 Task가 여기에 표시됩니다."
              />
            ))}
        </>
      }
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
            actorNamesById={actorNamesById}
            managedSystemNamesById={managedSystemNamesById}
            view={view}
            onClose={() => {
              returnFocus(selected.id);
              closePanel();
            }}
          />
        ) : null
      }
    />
  );
}
