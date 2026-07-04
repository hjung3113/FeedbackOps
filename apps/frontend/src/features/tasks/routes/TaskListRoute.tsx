import { getTask, listTasks } from '@/lib/api';
import { fetchManagedSystems } from '@/lib/api/managed-systems';
import { useWorkspaceActors } from '@/features/voc/hooks/useWorkspaceActors';
import type { TaskDetailDto, TaskDto } from '@fops/shared';
import {
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

function formatDate(raw: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(raw));
}

function TaskDetailPanel({
  taskId,
  onClose,
  actorNamesById,
  managedSystemNamesById,
}: {
  taskId: string;
  onClose: () => void;
  actorNamesById: ReadonlyMap<string, string>;
  managedSystemNamesById: ReadonlyMap<string, string>;
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
  return (
    <aside className="flex h-full flex-col bg-surface-detail">
      <DetailPanelHeader
        kind="task"
        id={shortId(task.id)}
        onClose={onClose}
        extras={
          <DetailPanelHeaderActions
            entityKind="task"
            entityId={task.id}
            copyUrl={`/tasks?view=backlog&param=${task.id}`}
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
          {source?.finding ? (
            <div className="mt-2 flex flex-col gap-2 rounded-sm border border-border-subtle bg-surface-card p-3">
              <span className="text-xs text-text-muted">From finding</span>
              <div className="text-sm font-medium text-text-primary">
                {source.finding.title}
                <span className="ml-2 font-mono text-xs text-text-muted">
                  {shortId(source.finding.id)}
                </span>
              </div>
              <p className="text-sm text-text-muted">{source.finding.summary}</p>
              <div className="flex flex-wrap gap-2">
                <OutlineBadge>Evidence · {source.finding.evidence_count}</OutlineBadge>
                {source.task_request && (
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
                ...(source?.finding
                  ? [
                      {
                        type: 'finding' as const,
                        id: source.finding.id,
                        display_id: shortId(source.finding.id),
                        title: source.finding.title,
                      },
                    ]
                  : []),
                { type: 'task' as const, id: task.id, display_id: shortId(task.id), title: task.title },
              ]}
            />
          </div>
        </div>
      </div>
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
              id={shortId(task.id)}
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
