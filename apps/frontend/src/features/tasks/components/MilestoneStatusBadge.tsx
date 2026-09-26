import { cn } from '@fops/ui';

export interface MilestoneStatusBadgeProps {
  /** MilestoneDto.status is a plain string (open G-status set); unknown falls back to Planning. */
  status: string;
  className?: string;
}

// Labels verbatim from MILESTONE_STATUS_META in screen-milestones.jsx.
// Pack 17 semantic tokens instead of the prototype's dark-theme rgba values:
// in_progress/do → --status-internal-doing (aether-blue) and --status-internal-done
// (emerald) match the prototype colors; planning uses the muted internal token.
// Blocked has no internal-status token yet, so it consumes --text-danger
// (the same warning-red value).
const STATUS_META: Record<string, { label: string; token: string }> = {
  planning: { label: 'Planning', token: '--status-internal-todo' },
  in_progress: { label: 'In progress', token: '--status-internal-doing' },
  blocked: { label: 'Blocked', token: '--text-danger' },
  released: { label: 'Released', token: '--status-internal-done' },
};

const FALLBACK_STATUS_META = { label: 'Planning', token: '--status-internal-todo' };

export function MilestoneStatusBadge({ status, className }: MilestoneStatusBadgeProps) {
  const meta = STATUS_META[status] ?? FALLBACK_STATUS_META;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm px-2.5 py-0.5 text-xs font-semibold',
        className,
      )}
      style={{
        color: `var(${meta.token})`,
        backgroundColor: `color-mix(in srgb, var(${meta.token}) 12%, transparent)`,
      }}
      data-token={meta.token}
    >
      {meta.label}
    </span>
  );
}
