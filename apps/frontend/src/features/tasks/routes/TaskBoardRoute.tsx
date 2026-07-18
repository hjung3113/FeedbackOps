import { TaskDetailPanel } from './TaskListRoute';
import { useWorkspaceActors } from '@/features/voc/hooks/useWorkspaceActors';
import { updateTaskStatus, listTasks } from '@/lib/api/tasks';
import { fetchManagedSystems } from '@/lib/api/managed-systems';
import { ApiError } from '@/lib/api/types';
import type { TaskDto, TaskStatus } from '@fops/shared';
import {
  Button,
  InternalTaskBadge,
  ListFilterButton,
  OutlineBadge,
  SeverityBadge,
  UserAvatar,
  WorkbenchShell,
} from '@fops/ui';
import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, Plus } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

const STATUS_COLUMNS: Array<{ key: TaskStatus; label: string }> = [
  { key: 'backlog', label: 'Backlog' }, { key: 'todo', label: 'Todo' },
  { key: 'doing', label: 'Doing' }, { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' }, { key: 'released', label: 'Released' },
  { key: 'reopened', label: 'Reopened' },
];
const GROUP_OPTIONS = [
  { value: 'status', label: 'Status (default)' }, { value: 'priority', label: 'Priority' },
  { value: 'managedSystem', label: 'Managed System' }, { value: 'assignee', label: 'Assignee' },
];
type GroupBy = (typeof GROUP_OPTIONS)[number]['value'];
type Filters = Record<string, string[]>;

function severity(priority: TaskDto['priority']): 'low' | 'medium' | 'high' | 'critical' {
  return priority === 'urgent' ? 'critical' : priority;
}
function groupValue(task: TaskDto, groupBy: GroupBy): string {
  if (groupBy === 'priority') return task.priority;
  if (groupBy === 'managedSystem') return task.primary_managed_system_id;
  if (groupBy === 'assignee') return task.assignee_actor_id ?? '__unassigned';
  return task.status;
}
function uuid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function DraggableTaskCard({ task, selected, onSelect, managedSystemName, assigneeName, enabled }: {
  task: TaskDto; selected: boolean; onSelect: () => void; managedSystemName: string; assigneeName?: string | undefined; enabled: boolean;
}) {
  const draggable = useDraggable({ id: task.id, data: { task }, disabled: !enabled });
  return (
    <button
      ref={draggable.setNodeRef}
      type="button"
      {...draggable.listeners}
      {...draggable.attributes}
      onClick={onSelect}
      aria-label={`${task.display_id}: ${task.title}`}
      className={`w-full cursor-grab rounded-sm border border-border-subtle bg-surface-card p-3 text-left shadow-sm transition ${selected ? 'ring-1 ring-border-selected' : ''} ${draggable.isDragging ? 'opacity-35' : ''}`}
    >
      <div className="flex items-center gap-1.5"><span className="font-mono text-xs text-text-muted">{task.display_id}</span><SeverityBadge severity={severity(task.priority)} /></div>
      {/* TaskDto does not project finding linkage or linked VOC counts; only TaskDetailDto.source does. */}
      <div className="mt-2 text-sm font-medium text-text-primary">{task.title}</div>
      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-text-muted"><span className="flex min-w-0 items-center gap-1.5 truncate"><span className="h-1.5 w-1.5 rounded-full bg-accent-info" />{managedSystemName}</span>{assigneeName ? <UserAvatar user={{ display_name: assigneeName }} size="sm" /> : <span className="rounded border border-border-subtle px-1.5 py-0.5">Unassigned</span>}</div>
      {!enabled && <span className="sr-only">Drag changes status only when grouped by status.</span>}
    </button>
  );
}

function BoardColumn({ id, label, tasks, groupBy, selectedId, selectTask, names, enabled }: {
  id: string; label: string; tasks: TaskDto[]; groupBy: GroupBy; selectedId: string | null; selectTask: (id: string) => void;
  names: { systems: ReadonlyMap<string, string>; actors: ReadonlyMap<string, string> }; enabled: boolean;
}) {
  const droppable = useDroppable({ id, disabled: groupBy !== 'status' });
  return <section ref={droppable.setNodeRef} className={`flex min-h-0 w-72 shrink-0 flex-col rounded-sm border border-border-subtle bg-surface-raised ${droppable.isOver ? 'ring-1 ring-accent-primary' : ''}`} aria-label={`${label} column`}>
    <header className="flex items-center gap-2 border-b border-border-subtle px-3 py-2"><>{groupBy === 'status' ? <InternalTaskBadge status={id as TaskStatus} /> : <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</span>}</><span className="text-xs tabular-nums text-text-muted">{tasks.length}</span><span className="flex-1" /><Button type="button" variant="ghost" size="sm" className="h-[22px] w-[22px] p-0" disabled title="Task creation API is not available yet" aria-label={`Add task to ${label}`}><Plus className="h-3 w-3" /></Button></header>
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
      {tasks.map((task) => <DraggableTaskCard key={task.id} task={task} selected={task.id === selectedId} onSelect={() => selectTask(task.id)} enabled={enabled} managedSystemName={names.systems.get(task.primary_managed_system_id) ?? 'Managed System'} assigneeName={task.assignee_actor_id ? names.actors.get(task.assignee_actor_id) : undefined} />)}
      {tasks.length === 0 && <div className="p-3 text-center text-xs text-text-muted">비어있음</div>}
    </div>
  </section>;
}

function GroupByButton({ value, onChange }: { value: GroupBy; onChange: (value: GroupBy) => void }) {
  const [open, setOpen] = React.useState(false);
  return <div className="relative">
    <Button type="button" variant="outline" size="sm" onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-haspopup="dialog"><Layers className="h-4 w-4" />Group by</Button>
    {open && <div role="dialog" aria-label="Group by options" className="absolute right-0 z-10 mt-1 w-52 rounded-md border border-border-subtle bg-surface-raised p-1 shadow-md">
      <div role="radiogroup" aria-label="Group by">{GROUP_OPTIONS.map((option) => <button key={option.value} type="button" role="radio" aria-checked={option.value === value} className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm text-text-primary hover:bg-surface-card" onClick={() => { onChange(option.value); setOpen(false); }}>{option.label}</button>)}</div>
    </div>}
  </div>;
}

export function TaskBoardRoute({ selectedParam }: { selectedParam?: string }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [groupBy, setGroupBy] = React.useState<GroupBy>('status');
  const [filters, setFilters] = React.useState<Filters>({});
  const [selectedId, setSelectedId] = React.useState<string | null>(selectedParam ?? null);
  const mutationTokens = React.useRef(new Map<string, number>());
  const tasksQuery = useQuery({ queryKey: ['tasks'] as const, queryFn: ({ signal }) => listTasks({ signal }), staleTime: 30_000 });
  const { actors } = useWorkspaceActors();
  const systemsQuery = useQuery({ queryKey: ['managed-systems', 'all'] as const, queryFn: ({ signal }) => fetchManagedSystems({ includeArchived: true, signal }), staleTime: 600_000 });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));
  const actorNames = React.useMemo(() => new Map((actors ?? []).map((a) => [a.id, a.display_name])), [actors]);
  const systemNames = React.useMemo(() => new Map((systemsQuery.data?.items ?? []).map((s) => [s.id, s.name])), [systemsQuery.data?.items]);
  const items = tasksQuery.data?.items ?? [];
  React.useEffect(() => { if (selectedParam !== undefined) setSelectedId(selectedParam); }, [selectedParam]);
  const filtered = React.useMemo(() => items.filter((task) => {
    const priority = filters.priority; const milestone = filters.milestone; const assignee = filters.assignee;
    return (!priority?.length || priority.includes(task.priority)) && (!milestone?.length || (milestone.includes('__any') && task.milestone_id !== null) || (milestone.includes('__none') && task.milestone_id === null)) && (!assignee?.length || (task.assignee_actor_id === null ? assignee.includes('__unassigned') : assignee.includes(task.assignee_actor_id)));
  }), [items, filters]);
  const columns = React.useMemo(() => {
    if (groupBy === 'status') return STATUS_COLUMNS;
    if (groupBy === 'priority') return ['urgent', 'high', 'medium', 'low'].map((key) => ({ key, label: key[0]!.toUpperCase() + key.slice(1) }));
    if (groupBy === 'managedSystem') return [...systemNames].map(([key, label]) => ({ key, label }));
    return [...new Set(filtered.map((t) => t.assignee_actor_id).filter((id): id is string => id !== null))].map((key) => ({ key, label: actorNames.get(key) ?? key })).concat({ key: '__unassigned', label: '미배정' });
  }, [actorNames, filtered, groupBy, systemNames]);
  const filterCategories = React.useMemo(() => {
    const assigneeIds = [...new Set(items.map((task) => task.assignee_actor_id).filter((id): id is string => id !== null))];
    return [{ key: 'priority', label: 'Priority', options: ['urgent', 'high', 'medium', 'low'].map((value) => ({ value, label: value[0]!.toUpperCase() + value.slice(1) })) }, { key: 'milestone', label: 'Milestone', options: [{ value: '__any', label: 'Milestone 있음' }, { value: '__none', label: 'Milestone 없음' }] }, { key: 'assignee', label: 'Assignee', options: [{ value: '__unassigned', label: '미배정' }, ...assigneeIds.map((value) => ({ value, label: actorNames.get(value) ?? value }))] }];
  }, [actorNames, items]);
  const mutation = useMutation({
    mutationKey: ['task-status-transition'],
    mutationFn: ({ task, status }: { task: TaskDto; status: TaskStatus }) => updateTaskStatus(task.id, status, { ifMatch: task.updated_at, idempotencyKey: uuid() }),
    onMutate: async ({ task, status }) => {
      const token = (mutationTokens.current.get(task.id) ?? 0) + 1;
      mutationTokens.current.set(task.id, token);
      await client.cancelQueries({ queryKey: ['tasks'] });
      const previousStatus = client.getQueryData<{ items: TaskDto[] }>(['tasks'])?.items.find((item) => item.id === task.id)?.status ?? task.status;
      client.setQueryData<{ items: TaskDto[] }>(['tasks'], (old) => old ? { ...old, items: old.items.map((item) => item.id === task.id ? { ...item, status } : item) } : old);
      return { taskId: task.id, previousStatus, token };
    },
    onError: (error, _variables, context) => {
      if (context && mutationTokens.current.get(context.taskId) === context.token) {
        client.setQueryData<{ items: TaskDto[] }>(['tasks'], (old) => old ? { ...old, items: old.items.map((item) => item.id === context.taskId ? { ...item, status: context.previousStatus } : item) } : old);
      }
      if (error instanceof ApiError && error.code === 'conflict.stale_write' && context && mutationTokens.current.get(context.taskId) === context.token) { void client.invalidateQueries({ queryKey: ['tasks'] }); toast.error('Task changed elsewhere. Board refreshed.'); return; }
      toast.error('Task status could not be updated.');
    },
    onSettled: (_data, _error, _variables, context) => {
      if (!context || mutationTokens.current.get(context.taskId) === context.token) {
        void client.invalidateQueries({ queryKey: ['tasks'] });
        if (context) void client.invalidateQueries({ queryKey: ['task', context.taskId] });
      }
    },
  });
  function selectTask(id: string) { setSelectedId(id); void navigate({ to: '/tasks', search: { view: 'board', param: id } }); }
  function onDragEnd(event: DragEndEvent) { const task = event.active.data.current?.task as TaskDto | undefined; const target = event.over?.id; if (groupBy !== 'status') { toast.warning('Group by Status 일 때만 드래그로 상태를 변경할 수 있습니다.'); return; } if (!task || typeof target !== 'string') return; if (task.status !== target) mutation.mutate({ task, status: target as TaskStatus }); }
  function moveToNextStatus(taskId: string) {
    const task = items.find((item) => item.id === taskId);
    const nextStatus: Partial<Record<TaskStatus, TaskStatus>> = { todo: 'doing', doing: 'review', review: 'done', done: 'released', reopened: 'todo' };
    const next = task && nextStatus[task.status];
    if (task && next) mutation.mutate({ task, status: next });
  }
  if (tasksQuery.isLoading) return <div className="p-4 text-sm text-text-muted">Loading Tasks...</div>;
  if (tasksQuery.error) return <div className="p-4 text-sm text-accent-danger">Task board unavailable.</div>;
  const selected = selectedId ? items.find((item) => item.id === selectedId) ?? null : null;
  return <WorkbenchShell toolbar={{ title: <span className="flex items-center gap-2">Board <OutlineBadge>{filtered.length} tasks</OutlineBadge></span>, actions: <><ListFilterButton categories={filterCategories} values={filters} onChange={setFilters} /><GroupByButton value={groupBy} onChange={setGroupBy} /><Button variant="primary" size="sm" disabled title="Task creation API is not available yet"><Plus className="h-4 w-4" />New task</Button></> }} detailPanel={selected ? <TaskDetailPanel taskId={selected.id} actorNamesById={actorNames} managedSystemNamesById={systemNames} view="board" onMoveToNextStatus={moveToNextStatus} onClose={() => { setSelectedId(null); void navigate({ to: '/tasks', search: { view: 'board' } }); }} /> : null}>
    <div className="flex items-stretch gap-4 border-b border-border-subtle bg-surface-canvas px-5 py-2.5">
      <StatBlock label="Total tasks" value={items.length} />
      <StatDivider />
      <StatBlock label="Unassigned" value={items.filter((task) => task.assignee_actor_id === null).length} valueClassName="text-accent-warn" />
      <StatDivider />
      <StatBlock label="In progress" value={items.filter((task) => task.status === 'doing').length} valueClassName="text-accent-success" />
    </div>
    <DndContext sensors={sensors} onDragEnd={onDragEnd}><div className="flex h-full gap-3 overflow-x-auto p-4">{columns.map((column) => <BoardColumn key={column.key} id={column.key} label={column.label} tasks={filtered.filter((task) => groupValue(task, groupBy) === column.key)} groupBy={groupBy} selectedId={selectedId} selectTask={selectTask} names={{ systems: systemNames, actors: actorNames }} enabled={groupBy === 'status'} />)}</div></DndContext>
  </WorkbenchShell>;
}

function StatBlock({ label, value, valueClassName = '' }: { label: string; value: number; valueClassName?: string }) {
  return <div className="flex flex-col gap-0.5"><span className="text-xs uppercase tracking-wide text-text-muted">{label}</span><span className={`text-base font-semibold tabular-nums ${valueClassName}`}>{value}</span></div>;
}

function StatDivider() {
  return <div className="w-px self-stretch bg-border-subtle" aria-hidden="true" />;
}
