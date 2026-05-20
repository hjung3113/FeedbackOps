/**
 * TriageRow — 96px expanded row for the triage queue.
 *
 * Prototype ref: screen-voc-create.jsx:363-391 (TriageQueueRow)
 * Layout: SeverityIndicator | row-body[title + row-meta] | row-trailing[createdAt]
 *
 * Prototype verbatim copy keys preserved:
 *   "Owner 없음"   — when owner_user_id and owner_team_id are both null
 *   "Area 미지정"  — when analytics_area_id is null
 *
 * Token translations (PROTOTYPE-TO-PACK17.md §3.8):
 *   .object-row.expanded → min-h-[96px] py-3.5 px-5
 *   .object-row.selected::before → before:absolute before:left-0 before:inset-y-0 before:w-0.5 before:bg-accent-primary
 *   .row-body → flex flex-col min-w-0 gap-0.5
 *   .row-title → text-[13px] font-medium text-text-primary truncate
 *   .row-meta → text-[12px] text-text-muted flex items-center gap-2 flex-wrap
 *   .row-meta .dot → w-0.5 h-0.5 rounded-full bg-text-disabled
 *   .row-trailing → flex items-center gap-2 shrink-0
 *   "Owner 없음" color: var(--color-warning-red) → text-text-danger
 *   "Area 미지정" color: var(--color-amber) → text-text-warning
 */

import * as React from 'react';
import type { VocListItem } from '@fops/shared';
import { SeverityIndicator, ReporterStatusBadge, cn } from '@fops/ui';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = then - now;
  const diffMin = Math.round(diffMs / 60000);
  const rtf = new Intl.RelativeTimeFormat('ko', { numeric: 'auto' });
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return rtf.format(diffHour, 'hour');
  const diffDay = Math.round(diffHour / 24);
  return rtf.format(diffDay, 'day');
}

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
        'relative flex w-full items-center gap-3 min-h-[96px] py-3.5 px-5 text-left',
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
        <div className="flex items-center gap-2 text-[13px] font-medium text-text-primary">
          <span className="font-mono text-xs text-text-disabled tabular-nums">
            {voc.display_id}
          </span>
          <span className="truncate">{voc.title}</span>
        </div>

        {/* Meta row — .row-meta */}
        <div className="flex items-center gap-2 text-[12px] text-text-muted flex-wrap">
          <ReporterStatusBadge status={voc.reporter_facing_status} />

          {areaMissing && (
            <>
              <span className="w-0.5 h-0.5 rounded-full bg-text-disabled shrink-0" aria-hidden="true" />
              <span className="text-text-warning">Area 미지정</span>
            </>
          )}

          {ownerMissing && (
            <>
              <span className="w-0.5 h-0.5 rounded-full bg-text-disabled shrink-0" aria-hidden="true" />
              <span className="text-text-danger">Owner 없음</span>
            </>
          )}

          {voc.similar_count > 0 && (
            <>
              <span className="w-0.5 h-0.5 rounded-full bg-text-disabled shrink-0" aria-hidden="true" />
              <span className="text-accent-primary">↔ similar {voc.similar_count}</span>
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
