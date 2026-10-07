import { GLOSSARY } from '@/lib/copy/glossary';
import { StatusBadgeFrame } from '@fops/ui';

export interface MilestoneStatusBadgeProps {
  /** MilestoneDto.status is the ADR-0050 closed set planning | in_progress |
      blocked | released (Accepted); unknown values still fall back to
      Planning defensively. */
  status: string;
  className?: string;
}

// Labels verbatim from MILESTONE_STATUS_META in screen-milestones.jsx.
// Pack 17 tokens preserve the base hue for the 12% tint and dot; StatusBadgeFrame
// uses the paired AA-safe -label tokens for text (doing already passes and keeps
// its base hue). Blocked has no internal-status token, so danger supplies its
// label text while --text-danger remains the tint and the dot uses accent-danger.
type MilestoneStatus = 'planning' | 'in_progress' | 'blocked' | 'released';

const STATUS_META: Record<
  MilestoneStatus,
  {
    label: string;
    token: string;
    dot: string;
    tone: 'internal-todo' | 'internal-doing' | 'danger' | 'internal-done';
  }
> = {
  planning: {
    label: GLOSSARY.milestoneStatusPlanning,
    token: '--status-internal-todo',
    dot: 'bg-status-internal-todo',
    tone: 'internal-todo',
  },
  in_progress: {
    label: GLOSSARY.milestoneStatusInProgress,
    token: '--status-internal-doing',
    dot: 'bg-status-internal-doing',
    tone: 'internal-doing',
  },
  blocked: {
    label: '차단',
    token: '--text-danger',
    dot: 'bg-accent-danger',
    tone: 'danger',
  },
  released: {
    label: GLOSSARY.milestoneStatusReleased,
    token: '--status-internal-done',
    dot: 'bg-status-internal-done',
    tone: 'internal-done',
  },
};

// Geometry per the prototype .badge/.badge-dot (styles.css:1246-1268): 20px
// pill, 6px side padding, 4px radius, 11px/500 label, 6×6 dot in the token
// color. Tokens are RGB channel triplets (ADR-0021), so they MUST be wrapped
// in rgb(... / <alpha>) — var(--token) alone is an invalid CSS color and the
// badge silently renders as black text on a transparent background
// (.review/pixel-514-findings.md finding 2); same consumption as
// packages/ui ReporterStatusBadge.
export function MilestoneStatusBadge({ status, className }: MilestoneStatusBadgeProps) {
  const normalizedStatus: MilestoneStatus = Object.hasOwn(STATUS_META, status)
    ? (status as MilestoneStatus)
    : 'planning';
  const meta = STATUS_META[normalizedStatus];

  return (
    <StatusBadgeFrame
      appearance="compact"
      tone={meta.tone}
      {...(className !== undefined ? { className } : {})}
      token={meta.token}
      indicator={
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 shrink-0 rounded-(--radius-pill) ${meta.dot}`}
        />
      }
    >
      {meta.label}
    </StatusBadgeFrame>
  );
}
