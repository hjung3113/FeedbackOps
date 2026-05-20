/**
 * TriagePanel — read-only first pass (Chunk 1).
 *
 * Prototype ref: screen-voc-create.jsx:393-587
 * Renders the right-column detail panel in the WorkbenchShell triage view.
 *
 * Chunk 1 scope: layout sections are rendered read-only.
 * Severity/Owner pickers are static display badges — wired in Chunk 2.
 * Dirty state is plumbed (useTriagePanelState) but action buttons are stubbed.
 *
 * Token translations (PROTOTYPE-TO-PACK17.md §3.5):
 *   .panel-scroll → pt-7 pr-6 pb-8 pl-6 overflow-y-auto flex-1
 *   .panel-section → mb-8 (last child mb-0)
 *   .panel-footer → border-t border-border-subtle p-5 flex flex-col gap-2 bg-surface-detail
 */

import * as React from 'react';
import type { VocListItem } from '@fops/shared';
import {
  PanelSectionTitle,
  PanelTitleBlock,
  FieldRow,
  ReporterStatusBadge,
  SeverityBadge,
  cn,
} from '@fops/ui';
import { useTriagePanelState } from '../../hooks/useTriagePanelState';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface TriagePanelProps {
  voc: VocListItem;
  /**
   * Stub callback for Chunk 1 — called when the user clicks action buttons.
   * Chunk 3 will wire real mutation.
   */
  onAct?: (kind: 'confirm' | 'finding' | 'skip') => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TriagePanel({ voc, onAct }: TriagePanelProps): React.ReactElement {
  const { panelState, dirty } = useTriagePanelState(voc);

  // Derived display values (Chunk 2 will wire interactive pickers)
  const displaySeverity = panelState.severity;
  const ownerMissing = panelState.ownerUserId === null && panelState.ownerTeamId === null;

  return (
    <div className="flex flex-col h-full bg-surface-detail border-l border-border-subtle overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between h-[50px] px-5 border-b border-border-subtle shrink-0">
        <span className="font-mono text-xs text-text-muted tabular-nums">{voc.display_id}</span>
        <div className="flex items-center gap-1">
          {/* Actions placeholder — Chunk 2+ */}
        </div>
      </div>

      {/* Scrollable body — .panel-scroll (§3.5): pt-7 pr-6 pb-8 pl-6 */}
      <div className="flex-1 overflow-y-auto pt-7 pr-6 pb-8 pl-6">
        {/* Overview / title block — .panel-title-block (§3.5): mb-6 */}
        <div className="mb-6">
          <PanelTitleBlock
            title={voc.title}
            badges={
              <>
                <ReporterStatusBadge status={voc.reporter_facing_status} />
                <span className="text-xs text-text-muted">
                  · {new Date(voc.created_at).toLocaleDateString('ko-KR')}
                </span>
              </>
            }
          />
        </div>

        {/* Severity section — read-only display (Chunk 2: SeverityPicker) */}
        <div className="mb-8">
          <PanelSectionTitle>Severity 결정</PanelSectionTitle>
          <FieldRow label="현재 심각도">
            {displaySeverity !== null ? (
              <SeverityBadge severity={displaySeverity as 'low' | 'medium' | 'high' | 'critical'} />
            ) : (
              <span className="text-sm text-text-muted">미지정</span>
            )}
          </FieldRow>
        </div>

        {/* Owner section — read-only display (Chunk 2: OwnerPicker) */}
        <div className="mb-8">
          <PanelSectionTitle>Owner 배정</PanelSectionTitle>
          <FieldRow label="담당자">
            {ownerMissing ? (
              <span className="text-sm text-text-danger">Owner 없음</span>
            ) : panelState.ownerUserId !== null ? (
              <span className="text-sm text-text-primary">
                {panelState.ownerUserId.slice(0, 8)}…
              </span>
            ) : (
              <span className="text-sm text-text-primary">
                Team {panelState.ownerTeamId?.slice(0, 8)}…
              </span>
            )}
          </FieldRow>
        </div>

        {/* Analytics Area section — read-only (Chunk 2: AnalyticsAreaPicker) */}
        <div className="mb-8">
          <PanelSectionTitle>Analytics Area 연결</PanelSectionTitle>
          <FieldRow label="Analytics Area">
            {panelState.analyticsAreaId !== null ? (
              <span className="text-sm text-text-primary">
                {panelState.analyticsAreaId.slice(0, 8)}…
              </span>
            ) : (
              <span className="text-sm text-text-muted">없음</span>
            )}
          </FieldRow>
        </div>

        {/* Triage decision summary — read-only preview (Chunk 2: TriageSummaryCard) */}
        <div className="mb-0">
          <PanelSectionTitle>Triage 결과 미리보기</PanelSectionTitle>
          <div className="bg-surface-canvas rounded-md p-3 flex flex-col gap-2.5">
            <FieldRow label="Severity">
              {displaySeverity !== null ? (
                <SeverityBadge severity={displaySeverity as 'low' | 'medium' | 'high' | 'critical'} />
              ) : (
                <span className="text-text-muted text-sm">미지정</span>
              )}
            </FieldRow>
            <FieldRow label="Owner">
              {ownerMissing ? (
                <span className="text-sm text-text-muted">미지정</span>
              ) : (
                <span className="text-sm text-text-primary">
                  {panelState.ownerUserId ?? panelState.ownerTeamId}
                </span>
              )}
            </FieldRow>
            <FieldRow label="Analytics Area">
              {panelState.analyticsAreaId !== null ? (
                <span className="text-sm text-text-primary">{panelState.analyticsAreaId.slice(0, 8)}</span>
              ) : (
                <span className="text-sm text-text-muted">없음</span>
              )}
            </FieldRow>
          </div>
        </div>
      </div>

      {/* Panel footer — .panel-footer (§3.5) */}
      {/* Prototype: btn-block primary "Triage 확정 & 다음 VOC" (disabled when !dirty)
          + secondary "Finding 만들기" + subtle "보류" */}
      <div
        className={cn(
          'border-t border-border-subtle p-5 flex flex-col gap-2 bg-surface-detail shrink-0',
        )}
      >
        <button
          type="button"
          disabled={!dirty}
          onClick={() => { onAct?.('confirm'); }}
          className={cn(
            'w-full inline-flex items-center justify-center gap-1.5',
            'h-8 px-3.5 rounded-md text-sm font-semibold',
            'bg-accent-primary text-text-on-accent',
            !dirty && 'opacity-40 pointer-events-none',
          )}
        >
          Triage 확정 &amp; 다음 VOC
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { onAct?.('finding'); }}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-7 px-2.5 rounded-md text-[13px] font-medium bg-surface-card text-text-primary border border-border-subtle hover:bg-surface-popover"
          >
            Finding 만들기
          </button>
          <button
            type="button"
            onClick={() => { onAct?.('skip'); }}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-7 px-2.5 rounded-md text-[13px] font-medium text-text-secondary hover:bg-surface-card hover:text-text-primary"
          >
            보류
          </button>
        </div>
      </div>
    </div>
  );
}

TriagePanel.displayName = 'TriagePanel';
