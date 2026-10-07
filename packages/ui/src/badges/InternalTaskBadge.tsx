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

/** English labels verbatim from `InternalTaskStatusLabels` in `docs/design-prototype/data.js`. */
const LABELS: Record<InternalTaskStatusEnum, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  doing: 'Doing',
  review: 'Review',
  done: 'Done',
  released: 'Released',
  reopened: 'Reopened',
};

const STATUS_CLASS: Record<
  InternalTaskStatusEnum,
  { textClassName: string; tintClassName: string }
> = {
  backlog: {
    textClassName: 'text-status-internal-backlog-label',
    tintClassName: 'bg-status-internal-backlog/12',
  },
  todo: {
    textClassName: 'text-status-internal-todo-label',
    tintClassName: 'bg-status-internal-todo/12',
  },
  doing: {
    textClassName: 'text-status-internal-doing-label',
    tintClassName: 'bg-status-internal-doing/12',
  },
  review: {
    textClassName: 'text-status-internal-review-label',
    tintClassName: 'bg-status-internal-review/12',
  },
  done: {
    textClassName: 'text-status-internal-done-label',
    tintClassName: 'bg-status-internal-done/12',
  },
  released: {
    textClassName: 'text-status-internal-released-label',
    tintClassName: 'bg-status-internal-released/12',
  },
  reopened: {
    textClassName: 'text-status-internal-reopened-label',
    tintClassName: 'bg-status-internal-reopened/12',
  },
};

/** Squared Task badge: the base hue supplies the 12% tint and its `-label` pair supplies text. */
export function InternalTaskBadge({ status, className }: InternalTaskBadgeProps) {
  const token = `--status-internal-${status}`;
  const { textClassName, tintClassName } = STATUS_CLASS[status];

  return (
    <StatusBadgeFrame
      appearance="task"
      {...(className !== undefined ? { className } : {})}
      token={token}
      textClassName={textClassName}
      tintClassName={tintClassName}
    >
      {LABELS[status]}
    </StatusBadgeFrame>
  );
}
