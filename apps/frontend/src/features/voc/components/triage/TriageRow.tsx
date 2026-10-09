/**
 * TriageRow — 96px expanded row for the triage queue.
 *
 * Prototype ref: screen-voc-create.jsx:363-391 (TriageQueueRow)
 * Layout: SeverityIndicator | row-body[title + row-meta] | row-trailing[createdAt]
 *
 * Missing owners use the shared danger badge; the missing-area label stays neutral.
 *
 * Token translations (PROTOTYPE-TO-PACK17.md §3.8):
 *   .object-row.expanded → min-h-row-expanded py-3.5 px-5
 *   .object-row.selected::before → before:absolute before:left-0 before:inset-y-0 before:w-0.5 before:bg-accent-primary
 *   .row-body → flex flex-col min-w-0 gap-0.5
 *   .row-title → text-sm font-medium text-text-primary truncate
 *   .row-meta → text-xs text-text-muted flex items-center gap-2 flex-wrap
 *   .row-meta .dot → w-0.5 h-0.5 rounded-full bg-text-disabled
 *   .row-trailing → flex items-center gap-2 shrink-0
 *   Semantic row color is limited to SeverityIndicator and ReporterStatusBadge.
 */

import { formatRelativeTime } from '@/lib/format/datetime';
import type { VocListItem } from '@fops/shared';
import { ReporterStatusBadge, SeverityIndicator, UnassignedBadge, cn } from '@fops/ui';
import type * as React from 'react';

import { formatSameManagedSystemVocCount } from '@/lib/copy/voc';
import { VOC_TRIAGE_TAB_LABELS } from '@/lib/copy/voc-views';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TriageRowProps {
  voc: VocListItem;
  selected: boolean;
  onSelect: () => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TriageRow({
  voc,
  selected,
  onSelect,
  className,
}: TriageRowProps): React.ReactElement {
  const ownerMissing = voc.owner_user_id === null && voc.owner_team_id === null;
  const areaMissing = voc.analytics_area_id === null;
  const relTime = formatRelativeTime(voc.created_at);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onSelect();
    }
  };

  return (
    <button
      type="button"
      role="button"
      aria-selected={selected}
      aria-label={`${voc.display_id} ${voc.title}`}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      className={cn(
        // Base layout — .object-row.expanded (§3.8)
        'relative flex w-full items-center gap-3 min-h-row-expanded py-3.5 px-5 text-left',
        // Bottom border
        'border-b border-border-subtle',
        // Hover
        'hover:bg-surface-row-hover',
        // Selected state
        selected && [
          'bg-surface-row-selected',
          // 2px neon-lime left bar (§3.8 .object-row.selected::before)
          'before:absolute before:left-0 before:inset-y-0 before:w-0.5 before:bg-accent-primary',
        ],
        className,
      )}
    >
      {/* LEFT: severity indicator — 3px × 16px pill (§3.2) */}
      <div className="flex items-center shrink-0">
        <SeverityIndicator severity={voc.severity ?? 'low'} />
      </div>

      {/* BODY: title + meta — .row-body (§3.8) */}
      <div className="flex flex-col min-w-0 gap-0.5 flex-1">
        {/* Title row — .row-title */}
        <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <span className="font-mono text-xs text-text-disabled tabular-nums">
            {voc.display_id}
          </span>
          <span className="truncate">{voc.title}</span>
        </div>

        {/* Meta row — .row-meta */}
        <div className="flex items-center gap-2 text-xs text-text-muted flex-wrap">
          <ReporterStatusBadge status={voc.reporter_facing_status} />

          {voc.review_postponed_at != null && (
            <>
              <span
                className="w-0.5 h-0.5 rounded-full bg-text-disabled shrink-0"
                aria-hidden="true"
              />
              <span className="text-text-muted">{VOC_TRIAGE_TAB_LABELS.waiting}</span>
            </>
          )}

          {areaMissing && (
            <>
              <span
                className="w-0.5 h-0.5 rounded-full bg-text-disabled shrink-0"
                aria-hidden="true"
              />
              <span className="text-text-muted">Analytics Area 미지정</span>
            </>
          )}

          {ownerMissing && (
            <>
              <span
                className="w-0.5 h-0.5 rounded-full bg-text-disabled shrink-0"
                aria-hidden="true"
              />
              <UnassignedBadge />
            </>
          )}

          {voc.similar_count > 0 && (
            <>
              <span
                className="w-0.5 h-0.5 rounded-full bg-text-disabled shrink-0"
                aria-hidden="true"
              />
              <span className="text-text-muted">
                {formatSameManagedSystemVocCount(voc.similar_count)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* TRAILING: created-at — .row-trailing */}
      <div className="flex items-center shrink-0">
        <span className="text-xs text-text-muted">{relTime}</span>
      </div>
    </button>
  );
}

TriageRow.displayName = 'TriageRow';
