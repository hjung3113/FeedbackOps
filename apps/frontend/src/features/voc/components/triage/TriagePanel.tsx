/**
 * TriagePanel — full read+pick pass (Chunk 2) + mutation wire-up (C3.2).
 *
 * Prototype ref: screen-voc-create.jsx:393-587
 * Renders the right-column detail panel in the WorkbenchShell triage view.
 *
 * C3.2: wires useUndoableMutation into TriageActions for optimistic mutation,
 * 4-sec undo, abort/compensate, and full error matrix.
 *
 * Token translations (PROTOTYPE-TO-PACK17.md §3.5):
 *   .panel-scroll → pt-7 pr-6 pb-8 pl-6 overflow-y-auto flex-1
 *   .panel-section → mb-8 (last child mb-0)
 *   .panel-footer handled by TriageActions component
 */

import { formatRecordDocumentTitle, useDocumentTitle } from '@/lib/router/document-title';
import { type FindingSeverity, type VocListItem, isTipTapDocStructurallyEmpty } from '@fops/shared';
import {
  AnalyticsAreaPicker,
  Button,
  DetailPanelSectionNav,
  PanelSectionTitle,
  PanelTitleBlock,
  ReporterStatusBadge,
  RichContentRenderer,
  type TipTapDoc,
} from '@fops/ui';
import { Maximize2, MoreHorizontal } from 'lucide-react';
import type * as React from 'react';

import { GLOSSARY } from '@/lib/copy/glossary';
import { SEMANTIC_VOC_RECOMMENDATIONS_LABEL } from '@/lib/copy/voc';
import { formatDate } from '@/lib/format/datetime';
import { ClusterSectionReadOnly } from './ClusterSectionReadOnly';
import { OwnerPicker } from './OwnerPicker';
import { type SeverityLevel, SeverityPicker } from './SeverityPicker';
import { TriageActions } from './TriageActions';
import { TriageSummaryCard } from './TriageSummaryCard';
import { useTriagePanelController } from './useTriagePanelController';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface TriagePanelProps {
  voc: VocListItem;
  /**
   * Called when a triage action is triggered. For non-mutation side-effects.
   */
  onAct?: (
    kind: 'confirm' | 'finding' | 'skip',
    /** Finding defaults and committed source context for the finding action. */
    context?: {
      vocId: string;
      managedSystemId: string;
      analyticsAreaId: string | null;
      title: string;
      severity: FindingSeverity;
    },
  ) => void;
  /**
   * C3.2: Optimistic remove — called synchronously on confirm/finding/skip
   * so the queue filters this VOC out immediately.
   */
  onOptimisticRemove?: (vocId: string) => void;
  /**
   * C3.2: Optimistic restore — called on error to re-insert the VOC into
   * the queue (stale_write, rate_limited, permission.denied paths).
   */
  onOptimisticRestore?: (vocId: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

// ADR-0051 groups the prototype's seven sections into four. The recommendation
// section is always present because ADR-0034 candidates are workspace-wide.
function buildTriageSections() {
  return [
    { id: 'overview', label: '개요' },
    { id: 'assignment', label: '담당 배정' },
    { id: 'similar', label: SEMANTIC_VOC_RECOMMENDATIONS_LABEL },
    { id: 'summary', label: '요약' },
  ];
}

export function TriagePanel({
  voc,
  onAct,
  onOptimisticRemove,
  onOptimisticRestore,
}: TriagePanelProps): React.ReactElement {
  const {
    panelState,
    baseline,
    dispatch,
    dirty,
    vocDetailQuery,
    scrollRef,
    candidates,
    actorMap,
    analyticsAreasQuery,
    aaOptions,
    currentOwnerId,
    baselineAreaName,
    stagedAreaName,
    panelLocked,
    isSubmitting,
    handleConfirmOrFinding,
    handleSkip,
  } = useTriagePanelController({
    voc,
    ...(onAct !== undefined ? { onAct } : {}),
    ...(onOptimisticRemove !== undefined ? { onOptimisticRemove } : {}),
    ...(onOptimisticRestore !== undefined ? { onOptimisticRestore } : {}),
  });
  const documentTitleRecord =
    vocDetailQuery.isSuccess &&
    !vocDetailQuery.isFetching &&
    vocDetailQuery.data?.id === voc.id &&
    vocDetailQuery.data !== undefined &&
    'title' in vocDetailQuery.data
      ? formatRecordDocumentTitle({
          displayId: vocDetailQuery.data.display_id,
          title: vocDetailQuery.data.title,
        })
      : null;
  useDocumentTitle(documentTitleRecord);

  // ── render ─────────────────────────────────────────────────────────────────

  const triageSections = buildTriageSections();

  return (
    <div className="flex flex-col h-full bg-surface-detail border-l border-border-subtle overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between h-toolbar px-5 border-b border-border-subtle shrink-0">
        <span className="font-mono text-xs text-text-muted tabular-nums">{voc.display_id}</span>
        {/* Expand + more ghost icon buttons (prototype L423-426). No behavior
            yet — rendered disabled to preserve the prototype affordance.
            Follow-up: wire panel fullscreen + overflow menu (deferred). */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled
            aria-label="패널 확장"
            data-testid="triage-panel-expand"
            className="h-7 w-7 p-0"
          >
            <Maximize2 size={14} aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled
            aria-label="더 보기"
            data-testid="triage-panel-more"
            className="h-7 w-7 p-0"
          >
            <MoreHorizontal size={14} aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Section nav — grouped per ADR-0051; no shared nav behavior changes. */}
      <DetailPanelSectionNav sections={triageSections} scrollRef={scrollRef} />

      {/* Scrollable body — V1b document rhythm (no dividers, typographic-only hierarchy) */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto pt-7 pr-6 pb-8 pl-6">
        {/* ADR-0051 intentionally groups the real description into Overview. */}
        <div className="mb-8" data-anchor="overview">
          <PanelTitleBlock title={voc.title} className="px-0! py-0! mb-2" />
          <div className="flex items-center gap-2 text-xs text-text-muted mb-4">
            <ReporterStatusBadge status={voc.reporter_facing_status} />
            <span aria-hidden="true">·</span>
            <span>{formatDate(voc.created_at)}</span>
          </div>
          <div data-testid="triage-description-region">
            {vocDetailQuery.isLoading && !vocDetailQuery.data ? (
              <p className="text-xs text-text-muted">불러오는 중…</p>
            ) : vocDetailQuery.data && 'description_rich_content' in vocDetailQuery.data ? (
              isTipTapDocStructurallyEmpty(vocDetailQuery.data.description_rich_content) ? (
                <p className="text-sm text-text-muted">본문 없음</p>
              ) : (
                <div className="text-sm text-text-secondary leading-relaxed">
                  <RichContentRenderer
                    doc={vocDetailQuery.data.description_rich_content as TipTapDoc}
                    mode="internal"
                  />
                </div>
              )
            ) : vocDetailQuery.data ? (
              <div className="rounded-md border border-dashed border-border-subtle p-3 text-sm text-text-muted">
                본문을 표시할 수 없습니다 — 이 VOC의 상세 내용을 볼 권한이 없습니다.
              </div>
            ) : vocDetailQuery.isError ? (
              <div className="rounded-md border border-dashed border-border-subtle p-3 text-sm text-text-muted">
                본문을 불러오지 못했습니다.
              </div>
            ) : (
              <p className="text-xs text-text-muted">불러오는 중…</p>
            )}
          </div>
        </div>

        <div className="mb-8" data-anchor="assignment">
          <div className="mb-6">
            <PanelSectionTitle>심각도 결정</PanelSectionTitle>
            <SeverityPicker
              value={(panelState.severity as SeverityLevel) ?? null}
              onChange={(sev) => {
                dispatch({ type: 'set_severity', severity: sev });
              }}
              disabled={panelLocked || isSubmitting}
            />
          </div>

          <div className="mb-6">
            <PanelSectionTitle>담당자 배정 (선택)</PanelSectionTitle>
            <OwnerPicker
              candidates={candidates}
              value={currentOwnerId}
              onChange={({ ownerUserId, ownerTeamId }) => {
                dispatch({ type: 'set_owner', ownerUserId, ownerTeamId });
              }}
            />
            <p className="text-xs text-text-muted mt-2 leading-relaxed">
              미지정 상태로 확정할 수 있으며 {GLOSSARY.owner}는 나중에 지정할 수 있습니다.
            </p>
          </div>

          <div>
            <PanelSectionTitle>Analytics Area 연결</PanelSectionTitle>
            {analyticsAreasQuery.isLoading ? (
              <p className="text-xs text-text-muted">Analytics Area를 불러오는 중입니다.</p>
            ) : analyticsAreasQuery.isError ? (
              <p className="text-xs text-text-danger">Analytics Area를 불러오지 못했습니다.</p>
            ) : aaOptions.length === 0 ? (
              <p className="text-xs text-text-muted">
                이 Managed System에 선택할 수 있는 Analytics Area가 없습니다.
              </p>
            ) : (
              <AnalyticsAreaPicker
                options={aaOptions}
                value={panelState.analyticsAreaId}
                onChange={(id) => {
                  dispatch({ type: 'set_analytics_area', analyticsAreaId: id });
                }}
                placeholder="Analytics Area 선택"
                testId="triage-aa-picker"
              />
            )}
            <p className="text-xs text-text-muted mt-2 leading-relaxed">
              Analytics Area는 권한 경계가 아닙니다. 분류·기본값 용도로만 사용됩니다.
            </p>
          </div>
        </div>

        {/* Semantic recommendations remain separate from the same-MS peer count. */}
        <ClusterSectionReadOnly vocId={voc.id} similarCount={voc.similar_count} />

        {/* Compact changed-fields summary */}
        <div className="mb-0" data-anchor="summary">
          <PanelSectionTitle>요약 · 변경 사항</PanelSectionTitle>
          <TriageSummaryCard
            panelState={panelState}
            baseline={baseline}
            actorMap={actorMap}
            baselineAnalyticsAreaName={baselineAreaName}
            analyticsAreaName={stagedAreaName}
            currentReporterStatus={voc.reporter_facing_status}
          />
        </div>
      </div>

      {/* Panel footer */}
      <TriageActions
        dirty={dirty && !panelLocked}
        submitting={isSubmitting}
        onConfirm={() => {
          handleConfirmOrFinding('confirm');
        }}
        onFinding={() => {
          handleConfirmOrFinding('finding');
        }}
        onSkip={handleSkip}
      />
    </div>
  );
}

TriagePanel.displayName = 'TriagePanel';
