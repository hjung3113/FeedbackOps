/**
 * TriageSummaryCard — "Triage 결과 미리보기" card.
 *
 * Prototype ref: screen-voc-create.jsx:543-569
 * Renders staged panel values (severity, owner, analytics area, cluster)
 * in a .card-nested style block with FieldRow rows.
 *
 * Token translations (PROTOTYPE-TO-PACK17.md §3.9, §3.6):
 *   .card-nested → bg-surface-canvas rounded-md p-3
 *   .field-row → FieldRow primitive
 */

import { FieldRow, ReporterStatusBadge, SeverityBadge, UserChip, cn } from '@fops/ui';
import type { AvatarUser, ReporterFacingStatusEnum } from '@fops/ui';
import { ArrowRight } from 'lucide-react';
import type * as React from 'react';
import type { TriagePanelLocalState } from '../../hooks/useTriagePanelState';

export interface TriageSummaryCardProps {
  panelState: TriagePanelLocalState;
  /**
   * Optional map of actor id → AvatarUser for display_name lookup.
   * When absent or id not found, a placeholder is shown.
   */
  actorMap?: Map<string, AvatarUser>;
  /** Optional analytics area name for display. */
  analyticsAreaName?: string | null | undefined;
  /** Optional owner team display name once team actors exist. */
  ownerTeamName?: string | null | undefined;
  /**
   * Current reporter-facing status of the VOC. When provided, the card renders
   * the "Reporter status 변경" transition row (current → assigned/reviewing).
   * Prototype ref: screen-voc-create.jsx:561-567.
   */
  currentReporterStatus?: ReporterFacingStatusEnum;
  className?: string;
}

export function TriageSummaryCard({
  panelState,
  actorMap,
  analyticsAreaName,
  ownerTeamName,
  currentReporterStatus,
  className,
}: TriageSummaryCardProps): React.ReactElement {
  const { severity, ownerUserId, ownerTeamId, analyticsAreaId } = panelState;

  const ownerUser = ownerUserId !== null ? (actorMap?.get(ownerUserId) ?? null) : null;

  const ownerMissing = ownerUserId === null && ownerTeamId === null;

  const areaLabel =
    analyticsAreaId !== null ? (analyticsAreaName ?? 'Analytics area') : null;

  return (
    <div className={cn('bg-surface-canvas rounded-md p-3 flex flex-col gap-2.5', className)}>
      {/* Severity row */}
      <FieldRow label="Severity">
        {severity !== null ? (
          <SeverityBadge severity={severity as 'low' | 'medium' | 'high' | 'critical'} />
        ) : (
          <span className="text-sm text-text-muted">미지정</span>
        )}
      </FieldRow>

      {/* Owner row */}
      <FieldRow label="Owner">
        {ownerMissing ? (
          <span className="text-sm text-text-muted">미지정</span>
        ) : ownerUser !== null ? (
          <UserChip user={ownerUser} size="sm" />
        ) : ownerUserId !== null ? (
          <span className="text-sm text-text-primary">Owner</span>
        ) : (
          <span className="flex flex-col items-end gap-0.5 text-sm text-text-primary">
            <span>{ownerTeamName ?? 'Owner team'}</span>
            {ownerTeamName === undefined || ownerTeamName === null ? (
              <span className="font-mono text-xs text-text-muted">{ownerTeamId?.slice(0, 8)}</span>
            ) : null}
          </span>
        )}
      </FieldRow>

      {/* Analytics Area row */}
      <FieldRow label="Analytics Area">
        {areaLabel !== null ? (
          <span className="text-sm text-text-primary">{areaLabel}</span>
        ) : (
          <span className="text-sm text-text-muted">없음</span>
        )}
      </FieldRow>

      {/* Cluster row — always "미결정" in Slice 3 (cluster table not yet shipped) */}
      <FieldRow label="Cluster">
        <span className="text-sm text-text-muted">미결정</span>
      </FieldRow>

      {/* Reporter status 변경 — transition preview (prototype L561-567).
          Target: 'assigned' when an owner is staged, else 'reviewing'. */}
      {currentReporterStatus !== undefined && (
        <FieldRow label="Reporter status 변경">
          <span className="flex items-center gap-1.5" data-testid="reporter-status-transition">
            <ReporterStatusBadge status={currentReporterStatus} />
            <ArrowRight size={10} className="text-text-muted shrink-0" aria-hidden="true" />
            <ReporterStatusBadge status={ownerMissing ? 'reviewing' : 'assigned'} />
          </span>
        </FieldRow>
      )}
    </div>
  );
}

TriageSummaryCard.displayName = 'TriageSummaryCard';
