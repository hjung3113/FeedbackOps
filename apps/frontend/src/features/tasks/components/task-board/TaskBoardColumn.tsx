import { useDroppable } from '@dnd-kit/core';
import type { TaskDto, TaskStatus } from '@fops/shared';
import { InternalTaskBadge } from '@fops/ui';

import { resolveTaskAssignee } from '../../adapters/taskDisplayAdapters';
import { TaskBoardCard } from './TaskBoardCard';
import type { TaskBoardGroupBy } from './TaskBoardGroupByButton';

export function TaskBoardColumn({
  id,
  label,
  tasks,
  groupBy,
  selectedId,
  selectTask,
  names,
  enabled,
}: {
  id: string;
  label: string;
  tasks: TaskDto[];
  groupBy: TaskBoardGroupBy;
  selectedId: string | null;
  selectTask: (id: string) => void;
  names: { systems: ReadonlyMap<string, string>; actors: ReadonlyMap<string, string> };
  enabled: boolean;
}) {
  const droppable = useDroppable({ id, disabled: groupBy !== 'status' });
  return (
    <section
      ref={droppable.setNodeRef}
      className={`flex min-h-0 w-72 shrink-0 flex-col rounded-sm border border-border-subtle bg-surface-raised ${droppable.isOver ? 'ring-1 ring-accent-primary' : ''}`}
      aria-label={`${label} 열`}
    >
      <header className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
        {groupBy === 'status' ? (
          <InternalTaskBadge status={id as TaskStatus} />
        ) : (
          <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            {label}
          </span>
        )}
        <span className="text-xs tabular-nums text-text-muted">{tasks.length}</span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
        {tasks.map((task) => {
          const assignee = resolveTaskAssignee(task.assignee_actor_id, names.actors);
          return (
            <TaskBoardCard
              key={task.id}
              task={task}
              selected={task.id === selectedId}
              onSelect={() => selectTask(task.id)}
              enabled={enabled}
              managedSystemName={
                names.systems.get(task.primary_managed_system_id) ?? 'Managed System'
              }
              assigneeName={assignee.kind === 'resolved' ? assignee.displayName : undefined}
            />
          );
        })}
        {tasks.length === 0 && (
          <div className="p-3 text-center text-xs text-text-muted">비어있음</div>
        )}
      </div>
    </section>
  );
}
