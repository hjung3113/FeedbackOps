/**
 * TriagePanel — full read+pick pass (Chunk 2).
 *
 * Prototype ref: screen-voc-create.jsx:393-587
 * Renders the right-column detail panel in the WorkbenchShell triage view.
 *
 * Chunk 2 scope: wires SeverityPicker, OwnerPicker, AnalyticsAreaPicker,
 * ClusterSectionReadOnly, TriageSummaryCard, TriageActions.
 * TriageActions.onConfirm fires no network request — stubbed until Chunk 3.
 *
 * Token translations (PROTOTYPE-TO-PACK17.md §3.5):
 *   .panel-scroll → pt-7 pr-6 pb-8 pl-6 overflow-y-auto flex-1
 *   .panel-section → mb-8 (last child mb-0)
 *   .panel-footer handled by TriageActions component
 */

import * as React from 'react';
import type { VocListItem } from '@fops/shared';
import {
  PanelSectionTitle,
  PanelTitleBlock,
  NestedTextBlock,
  ReporterStatusBadge,
  AnalyticsAreaPicker,
  type PickerOption,
  cn,
} from '@fops/ui';
import { useTriagePanelState } from '../../hooks/useTriagePanelState';
import { useWorkspaceActors } from '../../hooks/useWorkspaceActors';
import { SeverityPicker, type SeverityLevel } from './SeverityPicker';
import { OwnerPicker, type OwnerCandidate } from './OwnerPicker';
import { TriageSummaryCard } from './TriageSummaryCard';
import { ClusterSectionReadOnly } from './ClusterSectionReadOnly';
import { TriageActions } from './TriageActions';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface TriagePanelProps {
  voc: VocListItem;
  /**
   * Stub callback — called when the user triggers an action.
   * Chunk 3 will wire real mutation for 'confirm'.
   */
  onAct?: (kind: 'confirm' | 'finding' | 'skip') => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TriagePanel({ voc, onAct }: TriagePanelProps): React.ReactElement {
  const { panelState, dispatch, dirty } = useTriagePanelState(voc);
  const { actors } = useWorkspaceActors();

  // Build owner candidates from workspace actors list
  const candidates: OwnerCandidate[] = React.useMemo(() => {
    if (!actors) return [];
    return actors.map((a) => ({
      id: a.id,
      display_name: a.display_name,
      kind: a.kind,
    }));
  }, [actors]);

  // Build actor map for TriageSummaryCard display
  const actorMap = React.useMemo(() => {
    const map = new Map<string, { display_name: string }>();
    for (const c of candidates) {
      map.set(c.id, { display_name: c.display_name });
    }
    return map;
  }, [candidates]);

  // Stub analytics area options — real options come from useAnalyticsAreas in a later commit
  // TODO(#21 Chunk 2): wire real AA options from useAnalyticsAreas when available
  const aaOptions: PickerOption[] = [];

  const currentOwnerId = panelState.ownerUserId ?? panelState.ownerTeamId;

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

        {/* Description — prototype line 440-442 */}
        <div className="mb-8">
          <PanelSectionTitle>Body</PanelSectionTitle>
          {/* NestedTextBlock for plain-text description fallback */}
          <NestedTextBlock>
            <span className="text-sm text-text-secondary">{voc.title}</span>
          </NestedTextBlock>
        </div>

        {/* Severity section — SeverityPicker (§3.12) */}
        {/* Prototype: screen-voc-create.jsx:444-464 */}
        <div className={cn('mb-8')} data-anchor="severity">
          <PanelSectionTitle>Severity 결정</PanelSectionTitle>
          <SeverityPicker
            value={(panelState.severity as SeverityLevel) ?? null}
            onChange={(sev) => {
              dispatch({ type: 'set_severity', severity: sev });
            }}
          />
        </div>

        {/* Owner section — OwnerPicker (§3.15) */}
        {/* Prototype: screen-voc-create.jsx:466-491 */}
        <div className="mb-8" data-anchor="owner">
          <PanelSectionTitle>Owner 배정</PanelSectionTitle>
          <OwnerPicker
            candidates={candidates}
            value={currentOwnerId}
            onChange={({ ownerUserId, ownerTeamId }) => {
              dispatch({ type: 'set_owner', ownerUserId, ownerTeamId });
            }}
          />
        </div>

        {/* Analytics Area section */}
        {/* Prototype: screen-voc-create.jsx:493-510 */}
        <div className="mb-8" data-anchor="area">
          <PanelSectionTitle>Analytics Area 연결</PanelSectionTitle>
          <AnalyticsAreaPicker
            options={aaOptions}
            value={panelState.analyticsAreaId}
            onChange={(id) => {
              dispatch({ type: 'set_analytics_area', analyticsAreaId: id });
            }}
            placeholder="Analytics Area 선택"
            testId="triage-aa-picker"
          />
          <p className="text-xs text-text-muted mt-2 leading-relaxed">
            Analytics Area는 권한 경계가 아닙니다. 분류·기본값 용도로만 사용됩니다.
          </p>
        </div>

        {/* Cluster section — read-only empty state (Slice 3) */}
        {/* Prototype: screen-voc-create.jsx:512-541 */}
        <ClusterSectionReadOnly similarCount={voc.similar_count} />

        {/* Triage 결과 미리보기 */}
        {/* Prototype: screen-voc-create.jsx:543-569 */}
        <div className="mb-0" data-anchor="summary">
          <PanelSectionTitle>Triage 결과 미리보기</PanelSectionTitle>
          <TriageSummaryCard
            panelState={panelState}
            actorMap={actorMap}
          />
        </div>
      </div>

      {/* Panel footer — TriageActions */}
      {/* Prototype: screen-voc-create.jsx:572-584 */}
      <TriageActions
        dirty={dirty}
        submitting={false}
        onConfirm={() => { onAct?.('confirm'); }}
        onFinding={() => { onAct?.('finding'); }}
        onSkip={() => { onAct?.('skip'); }}
      />
    </div>
  );
}

TriagePanel.displayName = 'TriagePanel';
