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
import { useEffect, useRef, useState } from 'react';
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
  /** #935: true when the queue read failed with no rows; renders the load-error state in the queue column. */
  queueError?: boolean;
  /** #935: retry handler for a failed queue read, wired to the load-error state's button. */
  onRetryQueue?: () => void;
  /** Exclusion context: tab and Managed System scope, independent of selection/pin. */
  queueContext?: string;
  /** True only after a successful, non-placeholder queue read, with no fetch in flight. */
  queueSettled?: boolean;
  queueTotal?: number;
  queueTotalUnavailableState?: keyof typeof VOC_TRIAGE_QUEUE_TOTAL_LABELS;
  tabCounts?: Partial<Record<TriageTab, number>>;
  outOfScopeSummary?: {
    count: number;
    severity_distribution: Record<string, number>;
  };
  processedCount?: number;
  onProcessed?: (delta: 1 | -1) => void;
  onAdvanceVoc?: (id: string | null) => void;
  onSelectVoc: (id: string) => void;
  onTabChange: (tab: TriageTab) => void;
}

const TRIAGE_TABS: { value: TriageTab; label: string }[] = [
  { value: 'unassigned', label: VOC_TRIAGE_TAB_LABELS.unassigned },
  { value: 'untriaged', label: TRIAGE_STATE_LABELS.untriaged },
  { value: 'high', label: VOC_TRIAGE_TAB_LABELS.high },
  { value: 'waiting', label: VOC_TRIAGE_TAB_LABELS.waiting },
];
const TRIAGE_QUEUE_PANEL_ID = 'triage-queue-panel';

function canRestoreFocus(root: HTMLElement | null): boolean {
  const active = document.activeElement;
  if (
    active?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], dialog')
  ) {
    return false;
  }
  return (
    active === document.body ||
    (active !== null && root?.contains(active) === true) ||
    (active?.closest('[data-sonner-toast]') !== null && active?.textContent === '실행 취소')
  );
}

export function VocTriageScreen({
  items,
  selectedId,
  activeTab,
  queuePending,
  queueError,
  onRetryQueue,
  queueContext,
  queueSettled,
  queueTotal,
  queueTotalUnavailableState,
  tabCounts,
  outOfScopeSummary,
  processedCount = 0,
  onProcessed,
  onAdvanceVoc,
  onSelectVoc,
  onTabChange,
}: VocTriageScreenProps): React.ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pendingFocus, setPendingFocus] = useState<{
    id: string | null;
    sourceId: string | null;
    context: string;
    restore?: boolean;
    expiresAt?: number;
    undoToast?: Element | null;
  } | null>(null);
  const releaseRestoreFocus = useRef<(() => void) | null>(null);
  function handleAdvanceVoc(id: string | null): void {
    releaseRestoreFocus.current?.();
    setPendingFocus({ id, sourceId: selectedId, context: queueContext ?? activeTab });
    if (onAdvanceVoc) onAdvanceVoc(id);
    else if (id !== null) onSelectVoc(id);
  }
  function handleSelectVoc(id: string): void {
    releaseRestoreFocus.current?.();
    setPendingFocus(null);
    onSelectVoc(id);
  }
  function handleRestoreVoc(id: string): void {
    releaseRestoreFocus.current?.();
    setPendingFocus(
      canRestoreFocus(rootRef.current)
        ? {
            id,
            sourceId: selectedId,
            context: queueContext ?? activeTab,
            restore: true,
            expiresAt: Date.now() + 1000,
            undoToast: document.activeElement?.closest('[data-sonner-toast]') ?? null,
          }
        : null,
    );
    if (onAdvanceVoc) onAdvanceVoc(id);
    else onSelectVoc(id);
  }
  const {
    liveQueue,
    selectedVoc,
    deepLinkTargetMissing,
    createFindingTarget,
    handleAct,
    handleOptimisticRemove,
    handleOptimisticPostpone,
    handleOptimisticRestore,
    handleOptimisticRollback,
    handleQueueOutcome,
    closeCreateFinding,
  } = useVocTriageScreenController({
    items,
    selectedId,
    activeTab,
    onAdvanceVoc: handleAdvanceVoc,
    onRestoreVoc: handleRestoreVoc,
    queueContext: queueContext ?? activeTab,
    queueSettled: queueSettled === true,
  });
  const { isFullscreen, toggle, close } = useFullscreenPanel();
  useEffect(() => {
    if (selectedVoc === null) close();
  }, [close, selectedVoc]);
  const focusContext = useRef({ selectedId, context: queueContext ?? activeTab, pendingFocus });
  focusContext.current = { selectedId, context: queueContext ?? activeTab, pendingFocus };
  useEffect(() => {
    if (!pendingFocus?.restore) return;
    const retire = () => {
      releaseRestoreFocus.current?.();
      setPendingFocus((current) => (current === pendingFocus ? null : current));
    };
    const onFocusChange = () => {
      if (!canRestoreFocus(rootRef.current)) retire();
    };
    const expiry = setTimeout(retire, Math.max(0, (pendingFocus.expiresAt ?? 0) - Date.now()));
    document.addEventListener('focusin', onFocusChange);
    return () => {
      clearTimeout(expiry);
      document.removeEventListener('focusin', onFocusChange);
    };
  }, [pendingFocus]);
  useEffect(() => {
    if (!pendingFocus) return;
    if (
      pendingFocus.context !== (queueContext ?? activeTab) ||
      (selectedId !== pendingFocus.sourceId && selectedId !== pendingFocus.id)
    ) {
      setPendingFocus(null);
      return;
    }
    if (createFindingTarget) return;
    if (pendingFocus.restore && !canRestoreFocus(rootRef.current)) {
      setPendingFocus(null);
      return;
    }
    // Wait for the URL-driven selection to render before moving focus.
    if (pendingFocus.id !== (selectedVoc?.id ?? null)) return;
    const target =
      pendingFocus.id === null
        ? rootRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
        : isFullscreen
          ? rootRef.current?.querySelector<HTMLElement>('[data-testid="triage-panel-column"] h2')
          : rootRef.current?.querySelector<HTMLElement>(
              '[role="tabpanel"] button[aria-selected="true"]',
            );
    if (!target) return;
    if (!pendingFocus.restore) {
      target.focus();
      setPendingFocus(null);
      return;
    }
    // Sonner can return focus on blur as well as teardown. Keep this request
    // armed across the initial focus, but release even when neither path fires.
    let correction: ReturnType<typeof setTimeout> | undefined;
    const release = () => {
      document.removeEventListener('focusin', onFocusReturn);
      clearTimeout(correction);
      if (releaseRestoreFocus.current === release) releaseRestoreFocus.current = null;
    };
    const finish = () => {
      release();
      setPendingFocus((current) => (current === pendingFocus ? null : current));
    };
    const onFocusReturn = () => {
      if (!canRestoreFocus(rootRef.current)) {
        finish();
        return;
      }
      const active = document.activeElement;
      if (
        active === target ||
        !active?.closest('[role="tabpanel"] button[aria-selected], [role="tab"]') ||
        !rootRef.current?.contains(active)
      ) {
        return;
      }
      clearTimeout(correction);
      // Run after sonner's blur handler has cleared its own focus-return target.
      correction = setTimeout(() => {
        const current = focusContext.current;
        if (
          current.pendingFocus === pendingFocus &&
          Date.now() < (pendingFocus.expiresAt ?? 0) &&
          current.selectedId === pendingFocus.id &&
          current.context === pendingFocus.context &&
          target.isConnected &&
          canRestoreFocus(rootRef.current)
        ) {
          target.focus();
          // Blur may return focus before the toast's cleanup path runs.
          if (!pendingFocus.undoToast?.isConnected) finish();
        } else finish();
      }, 0);
    };
    releaseRestoreFocus.current = release;
    document.addEventListener('focusin', onFocusReturn);
    target.focus();
    return release;
  }, [
    pendingFocus,
    createFindingTarget,
    selectedId,
    selectedVoc,
    isFullscreen,
    queueContext,
    activeTab,
  ]);
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
    <div ref={rootRef} className="flex flex-col h-full">
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
          onTabChange={(next) => {
            releaseRestoreFocus.current?.();
            setPendingFocus(null);
            onTabChange(next as TriageTab);
          }}
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
            activeTab={activeTab}
            vocs={liveQueue}
            selectedId={selectedVoc?.id ?? null}
            onSelect={handleSelectVoc}
            {...(queuePending === true ? { queuePending } : {})}
            {...(queueError === true ? { queueError } : {})}
            {...(onRetryQueue !== undefined ? { onRetryQueue } : {})}
            {...(queueTotal !== undefined ? { queueTotal } : {})}
            {...(outOfScopeSummary !== undefined ? { outOfScopeSummary } : {})}
          />
        </div>

        {/* Deep link target this queue cannot show (#383) — never silently
            swap in another VOC's commit form. #922 FIX1: an uncached deep link
            mounts with queuePending=true and empty items, which is not yet
            evidence the target is missing — suppress the notice until the
            queue request settles. #935: a failed read is likewise not
            evidence — suppress while the queue error state is up. */}
        {deepLinkTargetMissing && queuePending !== true && queueError !== true && (
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
                  onOptimisticRemove={(id, input) => {
                    releaseRestoreFocus.current?.();
                    setPendingFocus(null);
                    handleOptimisticRemove(id, input);
                  }}
                  onOptimisticPostpone={(id, input) => {
                    releaseRestoreFocus.current?.();
                    setPendingFocus(null);
                    handleOptimisticPostpone(id, input);
                  }}
                  onMutationFailure={handleSelectVoc}
                  onQueueOutcome={handleQueueOutcome}
                  onOptimisticRollback={handleOptimisticRollback}
                  onOptimisticRestore={handleOptimisticRestore}
                  {...(onProcessed !== undefined ? { onProcessed } : {})}
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
          onCreated={() => {
            releaseRestoreFocus.current?.();
            setPendingFocus(null);
          }}
          onClose={() => {
            if (pendingFocus?.id !== (selectedVoc?.id ?? null)) setPendingFocus(null);
            closeCreateFinding();
          }}
        />
      )}
    </div>
  );
}

VocTriageScreen.displayName = 'VocTriageScreen';
