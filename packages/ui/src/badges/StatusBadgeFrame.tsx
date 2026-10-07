import type * as React from 'react';
import { cn } from '../utils/cn.js';

export type StatusBadgeAppearance =
  | 'reporter'
  | 'task'
  | 'severity'
  | 'compact'
  | 'compact-identity'
  | 'compact-outline'
  | 'link';
export type StatusBadgeTone =
  | 'success'
  | 'warning'
  | 'muted'
  | 'danger'
  | 'internal-todo'
  | 'internal-doing'
  | 'internal-done';

export interface StatusBadgeFrameProps {
  appearance: StatusBadgeAppearance;
  tone?: StatusBadgeTone;
  children: React.ReactNode;
  indicator?: React.ReactNode;
  textClassName?: string;
  tintClassName?: string;
  className?: string;
  style?: React.CSSProperties;
  token?: string;
}

const APPEARANCE_CLASS: Record<StatusBadgeAppearance, string> = {
  reporter: 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
  task: 'inline-flex items-center gap-1 rounded-sm px-2.5 py-0.5 text-xs font-semibold',
  severity: 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
  compact: 'inline-flex h-5 shrink-0 items-center gap-1 rounded px-1.5 text-tiny font-medium',
  'compact-identity':
    'inline-flex h-5 shrink-0 items-center gap-1 rounded px-1.5 text-tiny font-medium leading-none tracking-kind-label shadow-subtle text-text-secondary',
  'compact-outline':
    'inline-flex h-5 shrink-0 items-center gap-1 rounded px-1.5 text-tiny font-medium leading-none tracking-kind-label shadow-subtle text-text-muted',
  link: 'inline-flex h-5 items-center rounded px-1.5 text-tiny font-medium leading-none',
};

const TONE_CLASS: Record<StatusBadgeTone, { text: string; tint: string }> = {
  success: {
    text: 'text-text-success-label',
    // oxlint-disable-next-line shadcn/no-arbitrary-values -- status tint keeps the exact rgb alpha its #750 12% contrast ratios were measured on
    tint: 'bg-[rgb(var(--text-success)/0.12)]',
  },
  warning: {
    text: 'text-text-warning-label',
    // oxlint-disable-next-line shadcn/no-arbitrary-values -- status tint keeps the exact rgb alpha its #750 12% contrast ratios were measured on
    tint: 'bg-[rgb(var(--text-warning)/0.12)]',
  },
  muted: {
    text: 'text-text-muted',
    // oxlint-disable-next-line shadcn/no-arbitrary-values -- status tint keeps the exact rgb alpha its #750 12% contrast ratios were measured on
    tint: 'bg-[rgb(var(--text-muted)/0.12)]',
  },
  danger: {
    text: 'text-text-danger-label',
    // oxlint-disable-next-line shadcn/no-arbitrary-values -- status tint keeps the exact rgb alpha its #750 12% contrast ratios were measured on
    tint: 'bg-[rgb(var(--text-danger)/0.12)]',
  },
  'internal-todo': {
    text: 'text-status-internal-todo-label',
    tint: 'bg-status-internal-todo/12',
  },
  'internal-doing': {
    text: 'text-status-internal-doing-label',
    tint: 'bg-status-internal-doing/12',
  },
  'internal-done': {
    text: 'text-status-internal-done-label',
    tint: 'bg-status-internal-done/12',
  },
};

/** Shared status badge geometry with caller-owned state maps and tone colors. */
export function StatusBadgeFrame({
  appearance,
  tone,
  children,
  indicator,
  textClassName,
  tintClassName,
  className,
  style,
  token,
}: StatusBadgeFrameProps) {
  const toneClasses = tone !== undefined ? TONE_CLASS[tone] : undefined;
  const usesTokenTint = tone !== undefined && token !== undefined;
  const tintStyle = usesTokenTint
    ? ({
        ...(style ?? {}),
        '--status-badge-tint': `rgb(var(${token}) / 0.12)`,
      } as React.CSSProperties)
    : style;

  return (
    <span
      className={cn(
        APPEARANCE_CLASS[appearance],
        textClassName ?? toneClasses?.text,
        usesTokenTint ? 'bg-(--status-badge-tint)' : (tintClassName ?? toneClasses?.tint),
        className,
      )}
      {...(tintStyle !== undefined ? { style: tintStyle } : {})}
      {...(token !== undefined ? { 'data-token': token } : {})}
    >
      {indicator}
      {children}
    </span>
  );
}
