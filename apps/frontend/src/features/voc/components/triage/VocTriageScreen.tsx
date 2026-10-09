// VocTriageScreen — shell of the triage view.
//
// Prototype ref: screen-voc-create.jsx:589-697 (TriageScreen)
// Receives triage tab, managed system filter, selected VOC id, and handlers
// from TriageRoute. Composes TriageQueue + TriagePanel within WorkbenchShell
// scroll body.
//
// C3.2: the screen controller passes optimisticRemove + optimisticRestore
// into TriagePanel so the panel can drive queue side-effects on mutation.

import { CreateFindingModal } from '@/features/cross-system/create-finding/CreateFindingModal';
import { TRIAGE_STATE_LABELS } from '@/lib/copy/enum-labels';
import { GLOSSARY } from '@/lib/copy/glossary';
import { VOC_TRIAGE_QUEUE_TOTAL_LABELS, VOC_TRIAGE_TAB_LABELS } from '@/lib/copy/voc-views';
import { useFullscreenPanel } from '@/lib/panel/useFullscreenPanel';
import type { VocListItem } from '@fops/shared';
import {
  DetailPanelFullscreenContext,
  DetailPanelReadingColumn,
  ListTabs,
  type ListToolbarTab,
  ToolbarKicker,
} from '@fops/ui';
import { Flag } from 'lucide-react';
import { useEffect } from 'react';
import type * as React from 'react';
import { TriagePanel } from './TriagePanel';
import { TriageQueue } from './TriageQueue';
import { useVocTriageScreenController } from './useVocTriageScreenController';

export type TriageTab = 'unassigned' | 'untriaged' | 'high' | 'waiting';

export interface VocTriageScreenProps {
  items: VocListItem[];
  selectedId: string | null;
  activeTab: TriageTab;
  /** #922: true while the active tab's queue query is loading; keeps the tablist mounted. */
  queuePending?: boolean;
  /** Queue query identity (tab, scope and any server filters/pin). */
  queueContext?: string;
  /** True only after a successful queue read, with no fetch in flight. */
  queueSettled?: boolean;
  queueTotal?: number;
  queueTotalUnavailableState?: keyof typeof VOC_TRIAGE_QUEUE_TOTAL_LABELS;
  tabCounts?: Partial<Record<TriageTab, number>>;
  outOfScopeSummary?: {
    count: number;
    severity_distribution: Record<string, number>;
  };
  onSelectVoc: (id: string) => void;
  onTabChange: (tab: TriageTab) => void;
}

const TRIAGE_TABS: { value: TriageTab; label: string }[] = [
  { value: 'unassigned', label: VOC_TRIAGE_TAB_LABELS.unassigned },
  { value: 'untriaged', label: TRIAGE_STATE_LABELS.untriaged },
  { value: 'high', label: VOC_TRIAGE_TAB_LABELS.high },
  { value: 'waiting', label: '보류' },
];
const TRIAGE_QUEUE_PANEL_ID = 'triage-queue-panel';

export function VocTriageScreen({
  items,
  selectedId,
  activeTab,
  queuePending,
  queueContext,
  queueSettled,
  queueTotal,
  queueTotalUnavailableState,
  tabCounts,
  outOfScopeSummary,
  onSelectVoc,
  onTabChange,
}: VocTriageScreenProps): React.ReactElement {
  const {
    liveQueue,
    processedCount,
    selectedVoc,
    deepLinkTargetMissing,
    createFindingTarget,
    handleAct,
    handleOptimisticRemove,
    handleOptimisticRestore,
    closeCreateFinding,
  } = useVocTriageScreenController({
    items,
    selectedId,
    queueContext: queueContext ?? activeTab,
    queueSettled: queueSettled === true,
  });
  const { isFullscreen, toggle, close } = useFullscreenPanel();
  useEffect(() => {
    if (selectedVoc === null) close();
  }, [close, selectedVoc]);
  const tabs: ListToolbarTab[] = TRIAGE_TABS.map((tab) => {
    const badgeCount = tabCounts?.[tab.value];
    return {
      value: tab.value,
      label: tab.label,
      id: `triage-tab-${tab.value}`,
      controlsId: TRIAGE_QUEUE_PANEL_ID,
      ...(badgeCount !== undefined ? { badgeCount } : {}),
    };
  });
  const queueTotalAccessibleLabel =
    queueTotal === undefined
      ? VOC_TRIAGE_QUEUE_TOTAL_LABELS[queueTotalUnavailableState ?? 'unavailable']
      : `전체 대기열 ${queueTotal} VOC`;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar: kicker (V1 inline identity) + title + tab strip */}
      {/* V1: ShellHeader removed from WorkbenchShell; route identity lives here as a left-edge kicker. */}
      <div
        data-testid="triage-toolbar"
        className="flex items-center gap-2 px-5 h-toolbar border-b border-border-subtle bg-surface-detail shrink-0"
        data-toolbar-height="50"
      >
        {/* Kicker: "Console · Triage" — absorbs route identity previously held by ShellHeader toolbar prop. */}
        <ToolbarKicker
          label={GLOSSARY.console}
          name="Triage"
          testId="triage-kicker"
          labelTestId="triage-kicker-console"
          nameTestId="triage-kicker-name"
        />
        <Flag size={14} className="text-text-warning shrink-0" aria-hidden="true" />
        <span className="text-sm font-semibold text-text-primary">{GLOSSARY.triageQueue}</span>
        {/* #680 separates the whole-queue total from the selected tab's count. */}
        <output
          data-testid="triage-queue-total"
          aria-label={queueTotalAccessibleLabel}
          className="ml-1 inline-flex items-center gap-1 h-5 px-1.5 rounded-sm text-tiny font-medium bg-surface-canvas text-text-muted border border-border-subtle"
        >
          {queueTotal === undefined ? '— VOC' : `${queueTotal} VOC`}
        </output>
        <span className="text-xs text-text-muted ml-1" title="정렬: 미배정 → 심각도">
          미배정 → 심각도 순
        </span>
        {/* #750: retain the prototype's emerald tone with its AA label token. */}
        {processedCount > 0 && (
          <span
            data-testid="triage-processed-count"
            className="text-xs text-text-success-label ml-1"
          >
            · {processedCount}건 처리됨
          </span>
        )}

        {/* ADR-0022 keeps Triage tabs in the toolbar's right cluster. */}
        <ListTabs
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={(next) => onTabChange(next as TriageTab)}
          align="end"
        />
      </div>

      {/* Body: queue (left) + panel (right) */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: queue list */}
        <div
          id={TRIAGE_QUEUE_PANEL_ID}
          role="tabpanel"
          aria-labelledby={`triage-tab-${activeTab}`}
          className={
            isFullscreen ? 'hidden' : 'flex-1 min-w-0 overflow-y-auto border-r border-border-subtle'
          }
          hidden={isFullscreen}
        >
          <TriageQueue
            vocs={liveQueue}
            selectedId={selectedVoc?.id ?? null}
            onSelect={onSelectVoc}
            {...(queuePending === true ? { queuePending } : {})}
            {...(queueTotal !== undefined ? { queueTotal } : {})}
            {...(outOfScopeSummary !== undefined ? { outOfScopeSummary } : {})}
          />
        </div>

        {/* Deep link target this queue cannot show (#383) — never silently
            swap in another VOC's commit form. #922 FIX1: an uncached deep link
            mounts with queuePending=true and empty items, which is not yet
            evidence the target is missing — suppress the notice until the
            queue request settles. */}
        {deepLinkTargetMissing && queuePending !== true && (
          <div className="w-detail-panel shrink-0 border-l border-border-subtle p-6">
            <p
              data-testid="triage-deeplink-missing"
              className="text-sm font-medium text-text-primary"
            >
              요청한 VOC를 이 대기열에서 찾을 수 없습니다.
            </p>
            <p className="mt-2 text-sm text-text-muted">
              다른 담당자가 이미 처리했거나, 현재 권한 범위 밖일 수 있습니다. 왼쪽 대기열에서 다른
              VOC를 선택하세요.
            </p>
          </div>
        )}

        {/* Right: detail panel (always rendered when queue non-empty) */}
        {selectedVoc !== null && (
          <div
            className={
              isFullscreen ? 'flex-1 min-w-0 bg-surface-detail' : 'w-detail-panel shrink-0'
            }
          >
            <DetailPanelFullscreenContext.Provider value={{ expanded: isFullscreen, toggle }}>
              <DetailPanelReadingColumn data-testid="triage-panel-column">
                <TriagePanel
                  voc={selectedVoc}
                  onAct={handleAct}
                  onOptimisticRemove={handleOptimisticRemove}
                  onOptimisticRestore={handleOptimisticRestore}
                />
              </DetailPanelReadingColumn>
            </DetailPanelFullscreenContext.Provider>
          </div>
        )}
      </div>

      {createFindingTarget && (
        <CreateFindingModal
          vocId={createFindingTarget.vocId}
          managedSystemId={createFindingTarget.managedSystemId}
          sourceAnalyticsAreaId={createFindingTarget.analyticsAreaId}
          defaultTitle={createFindingTarget.defaultTitle}
          defaultSeverity={createFindingTarget.defaultSeverity}
          open={createFindingTarget !== null}
          onClose={closeCreateFinding}
        />
      )}
    </div>
  );
}

VocTriageScreen.displayName = 'VocTriageScreen';
