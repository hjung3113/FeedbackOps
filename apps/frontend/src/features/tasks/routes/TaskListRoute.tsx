import { ListStateMessage } from '@/components/ListStateMessage';
import { listTasks } from '@/lib/api';
import { fetchManagedSystems } from '@/lib/api/managed-systems';
import { isPermissionDenied } from '@/lib/api/types';
import { TASK_PRIORITY_LABELS } from '@/lib/copy/enum-labels';
import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import type { TaskDto } from '@fops/shared';
import {
  InternalTaskBadge,
  ListShell,
  ObjectRow,
  type ObjectRowSeverity,
  PermissionBlockedPanel,
} from '@fops/ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import * as React from 'react';
import { TaskDetailPanel } from '../components/TaskDetailPanel';

const PRIORITY_SEVERITY: Record<TaskDto['priority'], ObjectRowSeverity> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  urgent: 'critical',
};

function dot() {
  return <span className="h-1 w-1 rounded-full bg-text-muted/60" aria-hidden="true" />;
}

function formatDate(raw: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(raw));
}

export function TaskListRoute({
  selectedParam,
  managedSystem,
}: {
  selectedParam?: string | undefined;
  managedSystem?: string;
}) {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = React.useState<string | null>(selectedParam ?? null);
  const tasksQuery = useQuery({
    queryKey: ['tasks', managedSystem] as const,
    queryFn: ({ signal }) =>
      listTasks({
        signal,
        ...(managedSystem !== undefined ? { managed_system_id: managedSystem } : {}),
      }),
    staleTime: 30 * 1000,
  });
  const { actors } = useWorkspaceActors();
  const managedSystemsQuery = useQuery({
    queryKey: ['managed-systems', 'all'] as const,
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived: true, signal }),
    staleTime: 10 * 60 * 1000,
  });
  const items = tasksQuery.data?.items ?? [];
  const actorNamesById = React.useMemo(
    () => new Map((actors ?? []).map((actor) => [actor.id, actor.display_name])),
    [actors],
  );
  const managedSystemNamesById = React.useMemo(
    () => new Map((managedSystemsQuery.data?.items ?? []).map((ms) => [ms.id, ms.name])),
    [managedSystemsQuery.data?.items],
  );

  React.useEffect(() => {
    if (selectedParam !== undefined) setSelectedId(selectedParam);
  }, [selectedParam]);

  React.useEffect(() => {
    if (selectedId === null && items[0]) setSelectedId(items[0].id);
  }, [items, selectedId]);

  const selected = selectedId ? (items.find((item) => item.id === selectedId) ?? null) : null;

  function selectTask(id: string): void {
    setSelectedId(id);
    void navigate({ to: '/tasks', search: { view: 'backlog', param: id } });
  }

  if (tasksQuery.isLoading) {
    return <div className="p-4 text-sm text-text-muted">Loading Tasks...</div>;
  }
  if (isPermissionDenied(tasksQuery.error)) {
    return (
      <PermissionBlockedPanel
        state="denied"
        category="Task list"
        reason={PERMISSION_BLOCKED_REASONS.taskList}
        className="m-4"
      />
    );
  }
  if (tasksQuery.error) {
    return (
      <ListStateMessage
        variant="error"
        title="Task 목록을 불러오지 못했습니다"
        body="잠시 후 다시 시도하세요."
        action={{ label: '다시 시도', onClick: () => void tasksQuery.refetch() }}
      />
    );
  }

  return (
    <ListShell
      list={
        <>
          {items.map((task) => (
            <ObjectRow
              key={task.id}
              id={task.display_id}
              title={task.title}
              selected={selected?.id === task.id}
              density="default"
              severity={PRIORITY_SEVERITY[task.priority]}
              onClick={() => selectTask(task.id)}
              badges={<InternalTaskBadge status={task.status} />}
              meta={
                <>
                  <span>{TASK_PRIORITY_LABELS[task.priority]}</span>
                  {dot()}
                  <span>
                    {task.assignee_actor_id
                      ? (actorNamesById.get(task.assignee_actor_id) ?? 'Assigned')
                      : 'Unassigned'}
                  </span>
                  {dot()}
                  <span>
                    {managedSystemNamesById.get(task.primary_managed_system_id) ?? 'Managed System'}
                  </span>
                  {dot()}
                  <span>{formatDate(task.updated_at)}</span>
                </>
              }
            />
          ))}
          {items.length === 0 && (
            <ListStateMessage
              variant="empty"
              title="Task가 없습니다."
              body="생성된 Task가 여기에 표시됩니다."
            />
          )}
        </>
      }
      detailPanel={
        selected ? (
          <TaskDetailPanel
            taskId={selected.id}
            actorNamesById={actorNamesById}
            managedSystemNamesById={managedSystemNamesById}
            view="backlog"
            onClose={() => {
              setSelectedId(null);
              void navigate({ to: '/tasks', search: { view: 'backlog' } });
            }}
          />
        ) : null
      }
    />
  );
}
