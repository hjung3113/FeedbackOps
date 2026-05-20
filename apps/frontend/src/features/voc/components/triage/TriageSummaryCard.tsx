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

import * as React from 'react';
import { FieldRow, SeverityBadge, UserChip, cn } from '@fops/ui';
import type { TriagePanelLocalState } from '../../hooks/useTriagePanelState';
import type { AvatarUser } from '@fops/ui';

export interface TriageSummaryCardProps {
  panelState: TriagePanelLocalState;
  /**
   * Optional map of actor id → AvatarUser for display_name lookup.
   * When absent or id not found, a placeholder is shown.
   */
  actorMap?: Map<string, AvatarUser>;
  /** Optional analytics area name for display. */
  analyticsAreaName?: string | null;
  className?: string;
}

export function TriageSummaryCard({
  panelState,
  actorMap,
  analyticsAreaName,
  className,
}: TriageSummaryCardProps): React.ReactElement {
  const { severity, ownerUserId, ownerTeamId, analyticsAreaId } = panelState;

  const ownerUser =
    ownerUserId !== null
      ? (actorMap?.get(ownerUserId) ?? null)
      : null;

  const ownerMissing = ownerUserId === null && ownerTeamId === null;

  const areaLabel =
    analyticsAreaId !== null
      ? (analyticsAreaName ?? analyticsAreaId.slice(0, 8))
      : null;

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
          <span className="text-sm text-text-primary">{ownerUserId.slice(0, 8)}…</span>
        ) : (
          <span className="text-sm text-text-primary">Team {ownerTeamId?.slice(0, 8)}…</span>
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
    </div>
  );
}

TriageSummaryCard.displayName = 'TriageSummaryCard';
