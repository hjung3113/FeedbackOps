/**
 * VocRow — single-select row for the VOC inbox list.
 *
 * Mirrors docs/design-prototype/screen-voc.jsx `VocRow`: a checkbox + severity
 * indicator lead, a title line (id · title · "N similar"), a meta line
 * (reporter-status badge · severity badge · managed system · area/"No area" ·
 * time · linked finding), and a trailing identity column (owner avatar /
 * "Owner 필요" badge + reporter avatar).
 *
 * SELECTED STATE: prototype uses a 2px left accent bar (`.object-row.selected::before`,
 * `--color-neon-lime`) plus a tinted row background — NOT a full ring. Mirrored here.
 *
 * SEVERITY NULL CHOICE: when severity is null we render a dimmed SeverityIndicator
 * ('low' fallback at reduced opacity) and omit the SeverityBadge chip — there is
 * no badge variant for "unset". aria reads "low" for the indicator.
 *
 * HOOK-IN-MAP NOTE: VocRow calls no data hooks. VocList lifts the managed-system,
 * actor (owner/reporter), and analytics-area lookups to single map queries and
 * passes per-row results via props. Avoids rules-of-hooks issues + N fetches.
 *
 * DATA-DEFERRED (#89): `linked finding ref` is not present on VocListItem — the
 * `↔ FIN-xxx` chip renders only if a linkedFindingId is ever supplied (today never).
 */

import type { VocListItem } from '@fops/shared';
import {
  type AvatarUser,
  Checkbox,
  ManagedSystemPill,
  ReporterStatusBadge,
  SeverityBadge,
  SeverityIndicator,
  UserAvatar,
} from '@fops/ui';
import { cn } from '@fops/ui';
import { Layers, Paperclip } from 'lucide-react';
import type * as React from 'react';

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
// Severity → left-bar color token
// ---------------------------------------------------------------------------

type Severity = 'low' | 'medium' | 'high' | 'critical';

const SEVERITY_BAR_CLASS: Record<Severity, string> = {
  low: 'bg-severity-low',
  medium: 'bg-severity-medium',
  high: 'bg-severity-high',
  critical: 'bg-severity-critical',
};

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
  /** Resolved owner identity (from the workspace-actors map). Null = unassigned. */
  owner?: AvatarUser | null;
  /** Resolved reporter identity (from the workspace-actors map). Null = not resolvable. */
  reporter?: AvatarUser | null;
  /** Resolved analytics-area display name. Null = no area linked (amber "No area"). */
  areaName?: string | null;
  /** Bulk-selection checkbox state. When `onToggleCheck` is omitted the checkbox is hidden. */
  checked?: boolean;
  onToggleCheck?: () => void;
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
  owner,
  reporter,
  areaName,
  checked,
  onToggleCheck,
  className,
}: VocRowProps) {
  const ownerMissing = voc.owner_user_id === null && voc.owner_team_id === null;
  const relTime = formatVocCreatedAt(voc.created_at);
  const showCheckbox = onToggleCheck !== undefined;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onSelect();
    }
  };

  // Determine left-bar color: accent when selected, severity color otherwise.
  const severityBarClass = selected
    ? 'bg-accent-primary'
    : voc.severity !== null
      ? SEVERITY_BAR_CLASS[voc.severity]
      : 'bg-border-strong';

  return (
    <div
      role="row"
      aria-selected={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      className={cn(
        // Base layout — prototype .object-row: min-height 60px, padding 10px 20px, gap 12px
        'relative flex w-full items-center gap-3 px-5 py-2.5 min-h-[60px] text-left cursor-pointer',
        // Row divider — prototype .object-row { border-bottom: 1px solid var(--border-subtle) }
        'border-b border-border-subtle',
        // Hover
        'hover:bg-surface-row-hover',
        // Selected: tinted background
        selected && 'bg-surface-row-selected',
        // Permission-limited
        permissionLimited === true && 'opacity-60',
        className,
      )}
    >
      {/* LEFT EDGE BAR — full row height, 3px, severity-colored (accent when selected).
          Prototype: .severity-indicator { width:3px; height:16px } but shown as a full-height
          edge bar here per the issue spec. Single element avoids the ::before double-bar problem. */}
      <div
        data-testid="voc-row-left-bar"
        aria-hidden="true"
        className={cn('absolute left-0 top-0 bottom-0 w-[3px] rounded-r-sm', severityBarClass)}
      />

      {/* LEAD: checkbox (bulk select) + severity indicator. Click here must not
          open the detail panel. */}
      <div
        className="flex items-center gap-3 shrink-0"
        onClick={(e) => {
          e.stopPropagation();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
        }}
        role="presentation"
      >
        {showCheckbox && permissionLimited !== true && (
          <Checkbox
            checked={checked === true}
            onCheckedChange={() => onToggleCheck?.()}
            aria-label={`${voc.display_id} 선택`}
          />
        )}
        <SeverityIndicator severity={voc.severity ?? 'low'} />
      </div>

      {/* TITLE + META column */}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
        {permissionLimited === true ? (
          // Permission-limited peek: display_id + status only
          <div className="flex items-center gap-2 text-sm">
            <span className="font-mono text-text-muted text-xs">{voc.display_id}</span>
            <ReporterStatusBadge status={voc.reporter_facing_status} />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-xs text-text-disabled shrink-0">
                {voc.display_id}
              </span>
              <span className="font-medium text-text-primary truncate">{voc.title}</span>
              {voc.similar_count > 0 && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-status-reporter-reviewing/10 px-1.5 py-0.5 text-xs font-medium text-status-reporter-reviewing shrink-0"
                  aria-label={`${voc.similar_count} similar`}
                >
                  <Layers className="h-2.5 w-2.5" aria-hidden="true" />
                  {voc.similar_count} similar
                </span>
              )}
              {voc.attachment_count > 0 && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-text-muted/10 px-1.5 py-0.5 text-xs font-medium text-text-muted shrink-0"
                  aria-label={`${voc.attachment_count} attachments`}
                >
                  <Paperclip className="h-2.5 w-2.5" aria-hidden="true" />
                  {voc.attachment_count}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-text-muted overflow-hidden">
              <ReporterStatusBadge status={voc.reporter_facing_status} />
              {voc.severity !== null && <SeverityBadge severity={voc.severity} />}
              {managedSystem !== null && managedSystem !== undefined && (
                <ManagedSystemPill
                  name={managedSystem.name}
                  mark={managedSystem.mark}
                  archived={managedSystem.archived}
                />
              )}
              {areaName !== null && areaName !== undefined && areaName.length > 0 ? (
                <>
                  <RowDot />
                  <span>{areaName}</span>
                </>
              ) : voc.analytics_area_id === null ? (
                <>
                  <RowDot />
                  <span className="text-text-warning">No area</span>
                </>
              ) : null}
              <RowDot />
              <span>{relTime}</span>
            </div>
          </>
        )}
      </div>

      {/* TRAILING: owner avatar / "Owner 필요" + reporter avatar */}
      {permissionLimited !== true && (
        <div className="flex items-center gap-2 shrink-0">
          {ownerMissing ? (
            <span className="inline-flex items-center rounded-full bg-accent-danger/10 px-2 py-0.5 text-xs font-medium text-accent-danger">
              Owner 필요
            </span>
          ) : owner !== null && owner !== undefined ? (
            <UserAvatar user={owner} size="sm" />
          ) : null}
          {reporter !== null && reporter !== undefined && <UserAvatar user={reporter} size="sm" />}
        </div>
      )}
    </div>
  );
}

VocRow.displayName = 'VocRow';

/** 2px muted dot separator — mirrors prototype `.row-meta .dot`. */
function RowDot() {
  return (
    <span
      className="inline-block h-0.5 w-0.5 shrink-0 rounded-full bg-text-muted/60"
      aria-hidden="true"
    />
  );
}
