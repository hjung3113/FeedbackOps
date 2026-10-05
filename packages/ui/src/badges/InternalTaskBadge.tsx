import { StatusBadgeFrame } from './StatusBadgeFrame.js';

export type InternalTaskStatusEnum =
  | 'backlog'
  | 'todo'
  | 'doing'
  | 'review'
  | 'done'
  | 'released'
  | 'reopened';

export interface InternalTaskBadgeProps {
  status: InternalTaskStatusEnum;
  className?: string;
}

/**
 * English labels verbatim from `InternalTaskStatusLabels` in
 * `docs/design-prototype/data.js`.
 *
 * NOTE (Slice 3): linked_execution.taskRef is always null per #15,
 * so this badge is never rendered in the current release. It is
 * shipped now because #21 and Slice 4 consume it.
 */
const LABELS: Record<InternalTaskStatusEnum, string> = {
  backlog:  'Backlog',
  todo:     'Todo',
  doing:    'Doing',
  review:   'Review',
  done:     'Done',
  released: 'Released',
  reopened: 'Reopened',
};

const STATUS_CLASS: Record<InternalTaskStatusEnum, { text: string; tint: string }> = {
  backlog: { text: 'text-status-internal-backlog', tint: 'bg-status-internal-backlog/12' },
  todo: { text: 'text-status-internal-todo', tint: 'bg-status-internal-todo/12' },
  doing: { text: 'text-status-internal-doing', tint: 'bg-status-internal-doing/12' },
  review: { text: 'text-status-internal-review', tint: 'bg-status-internal-review/12' },
  done: { text: 'text-status-internal-done', tint: 'bg-status-internal-done/12' },
  released: { text: 'text-status-internal-released', tint: 'bg-status-internal-released/12' },
  reopened: { text: 'text-status-internal-reopened', tint: 'bg-status-internal-reopened/12' },
};

/**
 * Squared badge (`rounded-sm`) for internal task status.
 * Background uses `--status-internal-<status>` at 12 % opacity;
 * text uses the same token directly.
 */
export function InternalTaskBadge({ status, className }: InternalTaskBadgeProps) {
  const token = `--status-internal-${status}`;
  const statusClass = STATUS_CLASS[status];

  return (
    <StatusBadgeFrame
      appearance="task"
      textClassName={statusClass.text}
      tintClassName={statusClass.tint}
      {...(className !== undefined ? { className } : {})}
      token={token}
    >
      {LABELS[status]}
    </StatusBadgeFrame>
  );
}
