import { getTask, listTasks } from '@/lib/api';
import { fetchManagedSystems } from '@/lib/api/managed-systems';
import { useWorkspaceActors } from '@/features/voc/hooks/useWorkspaceActors';
import type { TaskDetailDto, TaskDto } from '@fops/shared';
import {
  Button,
  DetailPanelHeader,
  DetailPanelHeaderActions,
  DetailPanelSectionNav,
  FieldRow,
  InternalTaskBadge,
  LinkedEntityTrail,
  ListShell,
  ManagedSystemPill,
  ObjectRow,
  OutlineBadge,
  PanelSectionTitle,
  PanelTitleBlock,
  SeverityBadge,
  type ObjectRowSeverity,
  type PanelSection,
} from '@fops/ui';
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import * as React from 'react';

const PRIORITY_SEVERITY: Record<TaskDto['priority'], ObjectRowSeverity> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  urgent: 'critical',
};

const SECTIONS: PanelSection[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'properties', label: 'Properties' },
  { id: 'source', label: 'Source' },
  { id: 'context', label: 'Context' },
];

function dot() {
  return <span className="h-1 w-1 rounded-full bg-text-muted/60" aria-hidden="true" />;
}

function shortId(id: string): string {
  return `${id.slice(0, 8)}...`;
}

function optionalDisplayId(value: { id: string; display_id?: string | null }): string {
  return value.display_id?.trim() ? value.display_id : shortId(value.id);
}

function formatDate(raw: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(raw));
}

export function TaskDetailPanel({
  taskId,
  onClose,
  actorNamesById,
  managedSystemNamesById,
  view = 'backlog',
  onMoveToNextStatus,
}: {
  taskId: string;
  onClose: () => void;
  actorNamesById: ReadonlyMap<string, string>;
  managedSystemNamesById: ReadonlyMap<string, string>;
  view?: 'backlog' | 'board';
  onMoveToNextStatus?: (taskId: string) => void;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const taskQuery = useQuery({
    queryKey: ['task', taskId] as const,
    queryFn: ({ signal }) => getTask(taskId, signal),
    staleTime: 30 * 1000,
  });

  if (taskQuery.isLoading) {
    return <div className="p-4 text-sm text-text-muted">Loading Task...</div>;
  }
  if (taskQuery.error || !taskQuery.data) {
    return <div className="p-4 text-sm text-accent-danger">Task detail unavailable.</div>;
  }

  const task: TaskDetailDto = taskQuery.data;
  const source = task.source;
  const sourceFinding = source?.finding as
    | (NonNullable<TaskDetailDto['source']>['finding'] & { display_id?: string | null })
    | undefined;
  return (
    <aside className="flex h-full flex-col bg-surface-detail">
      <DetailPanelHeader
        kind="task"
        id={task.display_id}
        onClose={onClose}
        extras={
          <DetailPanelHeaderActions
            entityKind="task"
            entityId={task.id}
            copyUrl={`/tasks?view=${view}&param=${task.id}`}
          />
        }
      />
      <DetailPanelSectionNav sections={SECTIONS} scrollRef={scrollRef} />
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div data-anchor="overview">
          <PanelTitleBlock
            title={task.title}
            badges={
              <>
                <InternalTaskBadge status={task.status} />
                <SeverityBadge severity={PRIORITY_SEVERITY[task.priority]} />
              </>
            }
          />
        </div>

        <div data-anchor="properties" className="border-t border-border-subtle py-2">
          <PanelSectionTitle className="px-4">Properties</PanelSectionTitle>
          <FieldRow label="Status">
            <InternalTaskBadge status={task.status} />
          </FieldRow>
          <FieldRow label="Priority">
            <SeverityBadge severity={PRIORITY_SEVERITY[task.priority]} />
          </FieldRow>
          <FieldRow label="Assignee">
            {task.assignee_actor_id ? (
              <span className="text-sm text-text-primary">
                {actorNamesById.get(task.assignee_actor_id) ?? 'Assigned'}
              </span>
            ) : (
              <span className="text-accent-danger">Unassigned</span>
            )}
          </FieldRow>
          <FieldRow label="Due">{task.due_date ?? <span className="text-text-muted">-</span>}</FieldRow>
          <FieldRow label="Managed System">
            <ManagedSystemPill
              name={managedSystemNamesById.get(task.primary_managed_system_id) ?? 'Managed System'}
            />
          </FieldRow>
        </div>

        <div data-anchor="source" className="border-t border-border-subtle px-4 py-4">
          <PanelSectionTitle>Source evidence</PanelSectionTitle>
          {sourceFinding ? (
            <div className="mt-2 flex flex-col gap-2 rounded-sm border border-border-subtle bg-surface-card p-3">
              <span className="text-xs text-text-muted">From finding</span>
              <div className="text-sm font-medium text-text-primary">
                {sourceFinding.title}
                <span className="ml-2 font-mono text-xs text-text-muted">
                  {optionalDisplayId(sourceFinding)}
                </span>
              </div>
              <p className="text-sm text-text-muted">{sourceFinding.summary}</p>
              <div className="flex flex-wrap gap-2">
                <OutlineBadge>Evidence · {sourceFinding.evidence_count}</OutlineBadge>
                {source?.task_request && (
                  <OutlineBadge>Task Request · {source.task_request.status}</OutlineBadge>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-2 text-sm text-text-muted">Standalone task</div>
          )}
        </div>

        <div data-anchor="context" className="border-t border-border-subtle px-4 py-4">
          <PanelSectionTitle>Linked context</PanelSectionTitle>
          <div className="mt-2">
            <LinkedEntityTrail
              nodes={[
                ...(sourceFinding
                  ? [
                      {
                        type: 'finding' as const,
                        id: sourceFinding.id,
                        display_id: optionalDisplayId(sourceFinding),
                        title: sourceFinding.title,
                      },
                    ]
                  : []),
                { type: 'task' as const, id: task.id, display_id: task.display_id, title: task.title },
              ]}
            />
          </div>
        </div>
      </div>
      {view === 'board' && task.status !== 'backlog' && task.status !== 'released' && onMoveToNextStatus && (
        <div className="border-t border-border-subtle p-3">
          <Button type="button" variant="primary" className="w-full" onClick={() => onMoveToNextStatus(task.id)}>
            <ArrowRight className="h-4 w-4" />Move to next status
          </Button>
        </div>
      )}
    </aside>
  );
}

export function TaskListRoute({ selectedParam }: { selectedParam?: string | undefined }) {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = React.useState<string | null>(selectedParam ?? null);
  const tasksQuery = useQuery({
    queryKey: ['tasks'] as const,
    queryFn: ({ signal }) => listTasks({ signal }),
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
  if (tasksQuery.error) {
    return <div className="p-4 text-sm text-accent-danger">Task list unavailable.</div>;
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
                  <span>{task.priority}</span>
                  {dot()}
                  <span>
                    {task.assignee_actor_id
                      ? (actorNamesById.get(task.assignee_actor_id) ?? 'Assigned')
                      : 'Unassigned'}
                  </span>
                  {dot()}
                  <span>
                    {managedSystemNamesById.get(task.primary_managed_system_id) ??
                      'Managed System'}
                  </span>
                  {dot()}
                  <span>{formatDate(task.updated_at)}</span>
                </>
              }
            />
          ))}
          {items.length === 0 && <div className="px-5 py-8 text-sm text-text-muted">No Tasks.</div>}
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
