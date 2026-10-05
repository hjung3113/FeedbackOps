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

/**
 * Squared badge (`rounded-sm`) for internal task status. Keep its neutral
 * rendering until internal statuses have contrast-safe label tokens: the
 * original raw RGB token use rendered no text color or tint.
 */
export function InternalTaskBadge({ status, className }: InternalTaskBadgeProps) {
  const token = `--status-internal-${status}`;

  return (
    <StatusBadgeFrame
      appearance="task"
      {...(className !== undefined ? { className } : {})}
      token={token}
    >
      {LABELS[status]}
    </StatusBadgeFrame>
  );
}
