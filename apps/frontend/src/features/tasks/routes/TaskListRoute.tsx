import { ListLoadMore } from '@/components/ListLoadMore';
import { ListStateMessage } from '@/components/ListStateMessage';
import { getTask, listTasks } from '@/lib/api';
import { ApiError, isPermissionDenied } from '@/lib/api/types';
import { useMe } from '@/lib/auth/useMe';
import { TASK_PRIORITY_LABELS } from '@/lib/copy/enum-labels';
import { GLOSSARY } from '@/lib/copy/glossary';
import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import { formatCount } from '@/lib/format/count';
import { formatShortDateTime } from '@/lib/format/datetime';
import type { ListTasksResponse } from '@fops/shared';
import {
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
  useTaskManagedSystemNames,
} from '../adapters/taskDisplayAdapters';
import { TaskDetailPanel } from '../components/TaskDetailPanel';

const PAGE_SIZE = 50;

function dot() {
  return <span className="h-1 w-1 rounded-full bg-text-muted/60" aria-hidden="true" />;
}

export function TaskListRoute({
  view = 'backlog',
  selectedParam,
  managedSystem,
}: {
  view?: 'my' | 'backlog';
  selectedParam?: string | undefined;
  managedSystem?: string;
}) {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = React.useState<string | null>(selectedParam ?? null);
  const tasksQuery = useInfiniteQuery({
    queryKey: ['tasks', view, managedSystem, 'pages'] as const,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: ListTasksResponse) =>
      last.page?.has_more ? last.page.cursor : undefined,
    queryFn: ({ signal, pageParam }) =>
      listTasks({
        signal,
        limit: PAGE_SIZE,
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

  React.useEffect(() => {
    if (selectedParam !== undefined) setSelectedId(selectedParam);
  }, [selectedParam]);

  React.useEffect(() => {
    if (selectedId === null && items[0]) setSelectedId(items[0].id);
  }, [items, selectedId]);

  const selected = selectedId
    ? (items.find((item) => item.id === selectedId) ?? detailQuery.data ?? null)
    : null;
  React.useEffect(() => {
    const item = detailQuery.data;
    const filteredOut =
      item !== undefined &&
      ((managedSystem !== undefined &&
        managedSystem !== 'all' &&
        item.primary_managed_system_id !== managedSystem) ||
        (view === 'my' && me.data !== undefined && item.assignee_actor_id !== me.data.actor.id));
    if (
      (detailQuery.error instanceof ApiError && detailQuery.error.status === 404) ||
      filteredOut
    ) {
      setSelectedId(null);
      void navigate({
        to: '/tasks',
        replace: true,
        search: { view, ...(managedSystem === undefined ? {} : { managedSystem }) },
      });
    }
  }, [detailQuery.data, detailQuery.error, managedSystem, view, me.data, navigate]);

  function selectTask(id: string): void {
    setSelectedId(id);
    void navigate({ to: '/tasks', search: { view, param: id } });
  }

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
          {items.map((task) => {
            const assignee = resolveTaskAssignee(task.assignee_actor_id, actorNamesById);
            return (
              <ObjectRow
                key={task.id}
                id={task.display_id}
                title={task.title}
                selected={selected?.id === task.id}
                density="default"
                severity={taskPriorityToSeverity(task.priority)}
                onClick={() => selectTask(task.id)}
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
            (view === 'my' ? (
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
        isPermissionDenied(detailQuery.error) ? (
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
              setSelectedId(null);
              void navigate({ to: '/tasks', search: { view } });
            }}
          />
        ) : null
      }
    />
  );
}
