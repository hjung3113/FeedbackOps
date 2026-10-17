import { ListLoadMore } from '@/components/ListLoadMore';
import { TASK_BOARD_COPY } from '@/lib/copy/task-board';
import { useDroppable } from '@dnd-kit/core';
import type { TaskDto, TaskStatus } from '@fops/shared';
import { Button, InternalTaskBadge } from '@fops/ui';

import { resolveTaskAssignee, taskTeamLabel } from '../../adapters/taskDisplayAdapters';
import { TaskBoardCard } from './TaskBoardCard';
import type { TaskBoardGroupBy } from './TaskBoardGroupByButton';

export function TaskBoardColumn({
  id,
  label,
  tasks,
  total,
  state = 'ready',
  paging,
  onRetry,
  groupBy,
  selectedId,
  selectTask,
  names,
  enabled,
}: {
  id: string;
  label: string;
  tasks: TaskDto[];
  /** Server total for the column; `null` while unknown. Defaults to the loaded count. */
  total?: number | null | undefined;
  /** `loading`/`error` describe a column whose first page is not available. */
  state?: 'ready' | 'loading' | 'error';
  paging?: { hasMore: boolean; loadingMore: boolean; failed: boolean; onLoadMore: () => void };
  onRetry?: () => void;
  groupBy: TaskBoardGroupBy;
  selectedId: string | null;
  selectTask: (id: string) => void;
  names: {
    systems: ReadonlyMap<string, string>;
    actors: ReadonlyMap<string, string>;
    teams?: ReadonlyMap<string, string>;
  };
  enabled: boolean;
}) {
  const droppable = useDroppable({ id, disabled: groupBy !== 'status' });
  return (
    <section
      data-task-board-column
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
        <span className="text-xs tabular-nums text-text-muted">
          {total === null ? '—' : (total ?? tasks.length)}
        </span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
        <div ref={droppable.setNodeRef} className="flex min-h-full shrink-0 flex-col gap-2">
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
                assigneeName={
                  task.assignee_team_id
                    ? taskTeamLabel(task.assignee_team_id, names.teams ?? new Map())
                    : assignee.kind === 'resolved'
                      ? assignee.displayName
                      : undefined
                }
              />
            );
          })}
          {tasks.length === 0 && state === 'ready' && (
            <div className="p-3 text-center text-xs text-text-muted">비어있음</div>
          )}
          {state === 'loading' && (
            <div className="p-3 text-center text-xs text-text-muted">
              {TASK_BOARD_COPY.columnLoading}
            </div>
          )}
          {state === 'error' && (
            <div className="flex flex-col items-center gap-1 p-3 text-center text-xs text-text-muted">
              {TASK_BOARD_COPY.columnError}
              {onRetry ? (
                <Button variant="ghost" size="sm" onClick={onRetry}>
                  다시 시도
                </Button>
              ) : null}
            </div>
          )}
        </div>
        {paging ? (
          <ListLoadMore
            hasMore={paging.hasMore}
            loadingMore={paging.loadingMore}
            failed={paging.failed}
            onLoadMore={paging.onLoadMore}
          />
        ) : null}
      </div>
    </section>
  );
}
