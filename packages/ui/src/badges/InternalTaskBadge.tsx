import * as React from 'react';
import { cn } from '../utils/cn.js';

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
 * Squared badge (`rounded-sm`) for internal task status.
 * Background uses `--status-internal-<status>` at 12 % opacity;
 * text uses the same token directly.
 */
export function InternalTaskBadge({ status, className }: InternalTaskBadgeProps) {
  const token = `--status-internal-${status}`;

  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-sm px-2.5 py-0.5 text-xs font-semibold', className)}
      style={{
        color:           `var(${token})`,
        backgroundColor: `color-mix(in srgb, var(${token}) 12%, transparent)`,
      }}
      data-token={token}
    >
      {LABELS[status]}
    </span>
  );
}
