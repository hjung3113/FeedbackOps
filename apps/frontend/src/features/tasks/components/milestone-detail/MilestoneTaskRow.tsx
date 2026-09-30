import type { TaskDto } from '@fops/shared';
import { InternalTaskBadge, SeverityIndicator, UserAvatar } from '@fops/ui';
import { PRIORITY_SEVERITY } from './constants';

// Read-only child Task row mirroring screen-milestones.jsx:214-238.
export function MilestoneTaskRow({
  task,
  assigneeName,
}: {
  task: TaskDto;
  assigneeName?: string | undefined;
}) {
  return (
    // G-columns (ADR-0050 choice a, design §7 item 12): the prototype's estimate slot
    // renders the Task due_date; no estimate field exists.
    // Nested card geometry per prototype .card-nested: radius 6, borderless, 10/12 padding.
    <div className="flex items-center gap-2.5 rounded-md bg-surface-canvas px-3 py-2.5">
      <SeverityIndicator severity={PRIORITY_SEVERITY[task.priority]} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-text-muted">{task.display_id}</span>
          <span className="truncate text-sm font-medium text-text-primary">{task.title}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <InternalTaskBadge status={task.status} />
          {task.due_date !== null && <span>· {task.due_date}</span>}
          <span>· updated {task.updated_at.slice(0, 10)}</span>
        </div>
      </div>
      {assigneeName !== undefined ? (
        <UserAvatar user={{ display_name: assigneeName }} size="sm" />
      ) : task.assignee_actor_id === null ? (
        <span className="rounded border border-border-subtle px-1.5 py-0.5">미배정</span>
      ) : null}
    </div>
  );
}
