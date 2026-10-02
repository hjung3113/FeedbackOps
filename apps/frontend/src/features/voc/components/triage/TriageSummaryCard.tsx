/** Summary of staged changes in the triage panel. */

import { GLOSSARY } from '@/lib/copy/glossary';
import { FieldRow, ReporterStatusBadge, SEVERITY_LABELS, cn } from '@fops/ui';
import type { AvatarUser, ReporterFacingStatusEnum, SeverityEnum } from '@fops/ui';
import { ArrowRight } from 'lucide-react';
import type * as React from 'react';
import type { TriagePanelLocalState } from '../../hooks/useTriagePanelState';

export interface TriageSummaryCardProps {
  panelState: TriagePanelLocalState;
  baseline: TriagePanelLocalState;
  actorMap?: Map<string, AvatarUser>;
  baselineAnalyticsAreaName?: string | null | undefined;
  analyticsAreaName?: string | null | undefined;
  ownerTeamName?: string | null | undefined;
  currentReporterStatus?: ReporterFacingStatusEnum;
  className?: string;
}

function ownerLabel(
  ownerUserId: string | null,
  ownerTeamId: string | null,
  actorMap: Map<string, AvatarUser> | undefined,
  ownerTeamName: string | null | undefined,
): string {
  if (ownerUserId !== null) return actorMap?.get(ownerUserId)?.display_name ?? GLOSSARY.unknownUser;
  if (ownerTeamId !== null) return ownerTeamName ?? '알 수 없는 팀';
  return '미지정';
}

function DiffRow({ id, label, from, to }: { id: string; label: string; from: string; to: string }) {
  return (
    <FieldRow label={label}>
      <span className="flex items-center gap-1.5 text-sm" data-testid={`summary-diff-row-${id}`}>
        <span className="text-text-muted line-through">{from}</span>
        <ArrowRight size={10} className="text-text-muted shrink-0" aria-hidden="true" />
        <span className="text-text-primary font-medium">{to}</span>
      </span>
    </FieldRow>
  );
}

export function TriageSummaryCard({
  panelState,
  baseline,
  actorMap,
  baselineAnalyticsAreaName,
  analyticsAreaName,
  ownerTeamName,
  currentReporterStatus,
  className,
}: TriageSummaryCardProps): React.ReactElement {
  const severityChanged = panelState.severity !== baseline.severity;
  const ownerChanged =
    panelState.ownerUserId !== baseline.ownerUserId ||
    panelState.ownerTeamId !== baseline.ownerTeamId;
  const areaChanged = panelState.analyticsAreaId !== baseline.analyticsAreaId;
  const hasChanges = severityChanged || ownerChanged || areaChanged;
  const stagedOwnerMissing = panelState.ownerUserId === null && panelState.ownerTeamId === null;

  return (
    <div className={cn('bg-surface-canvas rounded-md p-3 flex flex-col gap-2.5', className)}>
      {!hasChanges ? (
        <p className="text-sm text-text-muted" data-testid="summary-no-changes">
          변경 없음 — 현재 값 그대로 확정됩니다.
        </p>
      ) : (
        <>
          {severityChanged && (
            <DiffRow
              id="Severity"
              label="심각도"
              from={
                baseline.severity === null
                  ? '미지정'
                  : (SEVERITY_LABELS[baseline.severity as SeverityEnum] ?? baseline.severity)
              }
              to={
                panelState.severity === null
                  ? '미지정'
                  : (SEVERITY_LABELS[panelState.severity as SeverityEnum] ?? panelState.severity)
              }
            />
          )}
          {ownerChanged && (
            <DiffRow
              id="Owner"
              label={GLOSSARY.owner}
              from={ownerLabel(baseline.ownerUserId, baseline.ownerTeamId, actorMap, ownerTeamName)}
              to={ownerLabel(
                panelState.ownerUserId,
                panelState.ownerTeamId,
                actorMap,
                ownerTeamName,
              )}
            />
          )}
          {areaChanged && (
            <DiffRow
              id="Analytics Area"
              label="Analytics Area"
              from={
                baseline.analyticsAreaId === null
                  ? '미지정'
                  : (baselineAnalyticsAreaName ?? 'Analytics Area')
              }
              to={
                panelState.analyticsAreaId === null
                  ? '미지정'
                  : (analyticsAreaName ?? 'Analytics Area')
              }
            />
          )}
        </>
      )}

      {currentReporterStatus !== undefined && (
        <div
          className="flex items-center gap-1.5 text-xs text-text-muted"
          data-testid="reporter-status-transition"
        >
          <span>확정 시 공개 상태:</span>
          <ReporterStatusBadge status={currentReporterStatus} />
          <ArrowRight size={10} className="text-text-muted shrink-0" aria-hidden="true" />
          <ReporterStatusBadge status={stagedOwnerMissing ? 'reviewing' : 'assigned'} />
        </div>
      )}
    </div>
  );
}

TriageSummaryCard.displayName = 'TriageSummaryCard';
