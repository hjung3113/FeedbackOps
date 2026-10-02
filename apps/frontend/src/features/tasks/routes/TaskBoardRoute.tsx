import { ListStateMessage } from '@/components/ListStateMessage';
import { mapUnknownError } from '@/lib/api/errorMapper';
import { listTasks } from '@/lib/api/tasks';
import { isPermissionDenied } from '@/lib/api/types';
import { TASK_PRIORITY_LABELS } from '@/lib/copy/enum-labels';
import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { type TaskDto, type TaskStatus, taskPrioritySchema } from '@fops/shared';
import {
  ListFilterButton,
  OutlineBadge,
  PermissionBlockedPanel,
  WorkbenchShell,
} from '@fops/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import * as React from 'react';
import { toast } from 'sonner';
import { useTaskManagedSystemNames } from '../adapters/taskDisplayAdapters';
import { TaskDetailPanel } from '../components/TaskDetailPanel';
import { TaskBoardColumn } from '../components/task-board/TaskBoardColumn';
import {
  type TaskBoardGroupBy,
  TaskBoardGroupByButton,
} from '../components/task-board/TaskBoardGroupByButton';
import { useTaskStatusTransition } from '../hooks/useTaskStatusTransition';

const STATUS_COLUMNS: Array<{ key: TaskStatus; label: string }> = [
  { key: 'backlog', label: 'Backlog' }, { key: 'todo', label: 'Todo' },
  { key: 'doing', label: 'Doing' }, { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' }, { key: 'released', label: 'Released' },
  { key: 'reopened', label: 'Reopened' },
];
type Filters = Record<string, string[]>;
function groupValue(task: TaskDto, groupBy: TaskBoardGroupBy): string {
  if (groupBy === 'priority') return task.priority;
  if (groupBy === 'managedSystem') return task.primary_managed_system_id;
  if (groupBy === 'assignee') return task.assignee_actor_id ?? '__unassigned';
  return task.status;
}

export function TaskBoardRoute({ selectedParam, managedSystem, publicUpdate }: { selectedParam?: string; managedSystem?: string; publicUpdate?: 'missing' }) {
  const navigate = useNavigate();
  const [groupBy, setGroupBy] = React.useState<TaskBoardGroupBy>('status');
  const [filters, setFilters] = React.useState<Filters>({});
  const [selectedId, setSelectedId] = React.useState<string | null>(selectedParam ?? null);
  const tasksKey = publicUpdate === 'missing' ? (['tasks', managedSystem, 'public_update:missing'] as const) : (['tasks', managedSystem] as const);
  const mutation = useTaskStatusTransition(tasksKey);
  const tasksQuery = useQuery({ queryKey: tasksKey, queryFn: ({ signal }) => listTasks({ signal, ...(managedSystem !== undefined ? { managed_system_id: managedSystem } : {}), ...(publicUpdate === 'missing' ? { public_update: publicUpdate } : {}) }), staleTime: 30_000 });
  const { actors } = useWorkspaceActors();
  const systemNames = useTaskManagedSystemNames();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));
  const actorNames = React.useMemo(() => new Map((actors ?? []).map((a) => [a.id, a.display_name])), [actors]);
  const items = tasksQuery.data?.items ?? [];
  React.useEffect(() => { if (selectedParam !== undefined) setSelectedId(selectedParam); }, [selectedParam]);
  const filtered = React.useMemo(() => items.filter((task) => {
    const priority = filters.priority; const milestone = filters.milestone; const assignee = filters.assignee;
    return (!priority?.length || priority.includes(task.priority)) && (!milestone?.length || (milestone.includes('__any') && task.milestone_id !== null) || (milestone.includes('__none') && task.milestone_id === null)) && (!assignee?.length || (task.assignee_actor_id === null ? assignee.includes('__unassigned') : assignee.includes(task.assignee_actor_id)));
  }), [items, filters]);
  const columns = React.useMemo(() => {
    if (groupBy === 'status') return STATUS_COLUMNS;
    if (groupBy === 'priority') {
      return [...taskPrioritySchema.options].reverse().map((key) => ({
        key,
        label: TASK_PRIORITY_LABELS[key],
      }));
    }
    if (groupBy === 'managedSystem') return [...systemNames].map(([key, label]) => ({ key, label }));
    return [...new Set(filtered.map((t) => t.assignee_actor_id).filter((id): id is string => id !== null))].map((key) => ({ key, label: actorNames.get(key) ?? key })).concat({ key: '__unassigned', label: '미배정' });
  }, [actorNames, filtered, groupBy, systemNames]);
  const filterCategories = React.useMemo(() => {
    const assigneeIds = [...new Set(items.map((task) => task.assignee_actor_id).filter((id): id is string => id !== null))];
    return [
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
        ],
      },
      {
        key: 'assignee',
        label: '담당자',
        options: [
          { value: '__unassigned', label: '미배정' },
          ...assigneeIds.map((value) => ({ value, label: actorNames.get(value) ?? value })),
        ],
      },
    ];
  }, [actorNames, items]);
  function boardSearch(param?: string): { view: 'board'; param?: string; public_update?: 'missing' } {
    return { view: 'board', ...(param !== undefined ? { param } : {}), ...(publicUpdate === 'missing' ? { public_update: publicUpdate } : {}) };
  }
  function selectTask(id: string) { setSelectedId(id); void navigate({ to: '/tasks', search: boardSearch(id) }); }
  function onDragEnd(event: DragEndEvent) { const task = event.active.data.current?.task as TaskDto | undefined; const target = event.over?.id; if (groupBy !== 'status') { toast.warning('상태로 그룹화한 경우에만 드래그로 상태를 변경할 수 있습니다.'); return; } if (!task || typeof target !== 'string') return; if (task.status !== target) mutation.mutate({ task, status: target as TaskStatus }); }
  function moveToNextStatus(taskId: string) {
    const task = items.find((item) => item.id === taskId);
    const nextStatus: Partial<Record<TaskStatus, TaskStatus>> = { backlog: 'todo', todo: 'doing', doing: 'review', review: 'done', done: 'released', reopened: 'todo' };
    const next = task && nextStatus[task.status];
    if (task && next) mutation.mutate({ task, status: next });
  }
  if (isPermissionDenied(tasksQuery.error)) {
    return (
      <PermissionBlockedPanel
        state="denied"
        category="Task board"
        reason={PERMISSION_BLOCKED_REASONS.taskList}
        className="m-4"
      />
    );
  }
  const selected = selectedId ? items.find((item) => item.id === selectedId) ?? null : null;
  return (
    <WorkbenchShell
      toolbar={{
        title: (
          <span className="flex items-center gap-2">
            보드
            {tasksQuery.isSuccess && !tasksQuery.isFetching && !tasksQuery.isError ? (
              <OutlineBadge>{filtered.length}건</OutlineBadge>
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
            <ListFilterButton categories={filterCategories} values={filters} onChange={setFilters} />
            <TaskBoardGroupByButton value={groupBy} onChange={setGroupBy} />
          </>
        ),
      }}
      detailPanel={
        selected ? (
          <TaskDetailPanel
            taskId={selected.id}
            actorNamesById={actorNames}
            managedSystemNamesById={systemNames}
            view="board"
            hasActionFooter={selected.status !== 'released'}
            onMoveToNextStatus={moveToNextStatus}
            onClose={() => {
              setSelectedId(null);
              void navigate({ to: '/tasks', search: boardSearch() });
            }}
          />
        ) : null
      }
    >
      <div
        aria-live={tasksQuery.isLoading || tasksQuery.isError ? 'polite' : 'off'}
        className="flex h-full min-h-0 flex-col"
      >
        {tasksQuery.isLoading ? (
          <div className="p-4 text-sm text-text-muted">Task 불러오는 중...</div>
        ) : tasksQuery.isError ? (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            <ListStateMessage
              variant="error"
              title="Task 보드를 불러오지 못했습니다."
              body={mapUnknownError(tasksQuery.error).message}
              action={{
                label: '다시 시도',
                onClick: () => {
                  void tasksQuery.refetch();
                },
              }}
            />
          </div>
        ) : (
          <>
            <div className="flex items-stretch gap-4 border-b border-border-subtle bg-surface-canvas px-5 py-2.5">
              <StatBlock label="전체 Task" value={items.length} />
              <StatDivider />
              <StatBlock
                label="미배정"
                value={items.filter((task) => task.assignee_actor_id === null).length}
                valueClassName="text-accent-warn"
              />
              <StatDivider />
              <StatBlock
                label="진행 중"
                value={items.filter((task) => task.status === 'doing').length}
                valueClassName="text-accent-success"
              />
            </div>
            {items.length === 0 ? (
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
              <DndContext sensors={sensors} onDragEnd={onDragEnd}>
                <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
                  {columns.map((column) => (
                    <TaskBoardColumn
                      key={column.key}
                      id={column.key}
                      label={column.label}
                      tasks={filtered.filter((task) => groupValue(task, groupBy) === column.key)}
                      groupBy={groupBy}
                      selectedId={selectedId}
                      selectTask={selectTask}
                      names={{ systems: systemNames, actors: actorNames }}
                      enabled={groupBy === 'status'}
                    />
                  ))}
                </div>
              </DndContext>
            )}
          </>
        )}
      </div>
    </WorkbenchShell>
  );
}

function StatBlock({ label, value, valueClassName = '' }: { label: string; value: number; valueClassName?: string }) {
  return <div className="flex flex-col gap-0.5"><span className="text-xs uppercase tracking-wide text-text-muted">{label}</span><span className={`text-base font-semibold tabular-nums ${valueClassName}`}>{value}</span></div>;
}

function StatDivider() {
  return <div className="w-px self-stretch bg-border-subtle" aria-hidden="true" />;
}
