/**
 * VocRow — 60px single-select row for the VOC list.
 *
 * SEVERITY NULL CHOICE: when severity is null, we render a dimmed SeverityIndicator
 * using 'low' as the fallback severity value (all 3 bars at 30% opacity via
 * SeverityIndicator's built-in dimming). This matches the "dimmed bars" option
 * in the spec and gives visual consistency over a muted dash. The aria-label
 * will read "low" for assistive tech — callers should note this if they need
 * a distinct "unset" semantic.
 *
 * HOOK-IN-MAP NOTE: VocRow does NOT call useManagedSystem directly.
 * The caller (VocList) lifts useManagedSystem to a single useManagedSystemMap()
 * call that returns Record<id, ResolvedManagedSystem> and passes the per-row
 * result via the `managedSystem` prop. This avoids any rules-of-hooks concern
 * and makes zero extra fetches (all rows share the same cache key).
 */

import * as React from 'react';
import type { VocListItem } from '@fops/shared';
import {
  SeverityIndicator,
  ReporterStatusBadge,
  ManagedSystemPill,
} from '@fops/ui';
import { cn } from '@fops/ui';

// ---------------------------------------------------------------------------
// Korean relative-time helper
// ---------------------------------------------------------------------------

function formatRelativeImpl(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = then - now; // negative for past
  const diffMin = Math.round(diffMs / 60000);
  const rtf = new Intl.RelativeTimeFormat('ko', { numeric: 'auto' });
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return rtf.format(diffHour, 'hour');
  const diffDay = Math.round(diffHour / 24);
  return rtf.format(diffDay, 'day');
}

/** Named export so Detail panel (C8) can reuse without re-implementing. */
export function formatVocCreatedAt(iso: string): string {
  return formatRelativeImpl(iso);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VocRowProps {
  voc: VocListItem;
  selected: boolean;
  onSelect: () => void;
  /**
   * Permission-limited mode. When true, the row body is replaced by a peek
   * (display_id + reporter status only). Triggered when the actor has only
   * `summary_visible` decision on this VOC.
   */
  permissionLimited?: boolean;
  /**
   * Optional resolver for the MS pill — caller (VocList) calls useManagedSystem
   * per row and passes the result in. Decouples primitive from the hook.
   */
  managedSystem?: { name: string; mark: string; archived: boolean } | null;
  className?: string;
}

// ---------------------------------------------------------------------------
// VocRow
// ---------------------------------------------------------------------------

export function VocRow({
  voc,
  selected,
  onSelect,
  permissionLimited,
  managedSystem,
  className,
}: VocRowProps) {
  const ownerMissing = voc.owner_user_id === null && voc.owner_team_id === null;
  const relTime = formatVocCreatedAt(voc.created_at);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onSelect();
    }
  };

  return (
    <button
      type="button"
      role="row"
      aria-selected={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      className={cn(
        // Base layout
        'flex w-full items-center gap-3 px-4 h-15 text-left',
        // Hover
        'hover:bg-surface-detail',
        // Selected
        selected && 'bg-surface-detail ring-1 ring-[color:var(--border-selected)]',
        // Permission-limited
        permissionLimited === true && 'opacity-60',
        className,
      )}
    >
      {/* LEFT: severity indicator */}
      <SeverityIndicator severity={voc.severity ?? 'low'} />

      {/* TITLE column */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        {permissionLimited === true ? (
          // Permission-limited peek: display_id + status only
          <div className="flex items-center gap-2 text-sm">
            <span className="font-mono text-text-muted text-xs">{voc.display_id}</span>
            <ReporterStatusBadge status={voc.reporter_facing_status} />
          </div>
        ) : (
          <>
            <span className="font-medium text-text-primary truncate">{voc.title}</span>
            <div className="flex items-center gap-2 text-xs text-text-muted flex-wrap">
              <span className="font-mono">{voc.display_id}</span>
              <ReporterStatusBadge status={voc.reporter_facing_status} />
              {managedSystem !== null && managedSystem !== undefined && (
                <ManagedSystemPill
                  name={managedSystem.name}
                  mark={managedSystem.mark}
                  archived={managedSystem.archived}
                />
              )}
              {ownerMissing ? (
                <span className="text-[color:var(--color-warning-red)]">Owner 없음</span>
              ) : null}
            </div>
          </>
        )}
      </div>

      {/* TRAILING: relative time */}
      {permissionLimited !== true && (
        <span className="text-xs text-text-muted shrink-0">{relTime}</span>
      )}
    </button>
  );
}

VocRow.displayName = 'VocRow';
