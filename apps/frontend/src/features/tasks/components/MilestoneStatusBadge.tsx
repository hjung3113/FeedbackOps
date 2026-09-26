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

// Geometry per the prototype .badge/.badge-dot (styles.css:1246-1268): 20px
// pill, 6px side padding, 4px radius, 11px/500 label, 6×6 dot in the token
// color. Tokens are RGB channel triplets (ADR-0021), so they MUST be wrapped
// in rgb(... / <alpha>) — var(--token) alone is an invalid CSS color and the
// badge silently renders as black text on a transparent background
// (.review/pixel-514-findings.md finding 2); same consumption as
// packages/ui ReporterStatusBadge.
export function MilestoneStatusBadge({ status, className }: MilestoneStatusBadgeProps) {
  const meta = STATUS_META[status] ?? FALLBACK_STATUS_META;

  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded px-1.5 text-[11px] font-medium',
        className,
      )}
      style={{
        color: `rgb(var(${meta.token}) / 1)`,
        backgroundColor: `rgb(var(${meta.token}) / 0.12)`,
      }}
      data-token={meta.token}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: `rgb(var(${meta.token}) / 1)` }}
      />
      {meta.label}
    </span>
  );
}
