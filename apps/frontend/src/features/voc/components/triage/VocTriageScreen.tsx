// VocTriageScreen — shell of the triage view.
//
// Prototype ref: screen-voc-create.jsx:589-697 (TriageScreen)
// Receives triage tab, managed system filter, selected VOC id, and handlers
// from TriageRoute. Composes TriageQueue + TriagePanel within WorkbenchShell
// scroll body.
//
// C3.2: passes optimisticRemove + optimisticRestore from useTriageQueue into
// TriagePanel so the panel can drive queue side-effects on mutation.

import { CreateFindingModal } from '@/features/cross-system/create-finding/CreateFindingModal';
import { TRIAGE_STATE_LABELS } from '@/lib/copy/enum-labels';
import { GLOSSARY } from '@/lib/copy/glossary';
import { VOC_TRIAGE_QUEUE_TOTAL_LABELS, VOC_TRIAGE_TAB_LABELS } from '@/lib/copy/voc-views';
import type { FindingSeverity, VocListItem } from '@fops/shared';
import { ListTabs, type ListToolbarTab } from '@fops/ui';
import { Flag } from 'lucide-react';
import type * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTriageQueue } from '../../hooks/useTriageQueue';
import { TriagePanel } from './TriagePanel';
import { TriageQueue } from './TriageQueue';

export type TriageTab = 'unassigned' | 'untriaged' | 'high' | 'waiting';

export interface VocTriageScreenProps {
  items: VocListItem[];
  selectedId: string | null;
  activeTab: TriageTab;
  queueTotal?: number;
  queueTotalUnavailableState?: keyof typeof VOC_TRIAGE_QUEUE_TOTAL_LABELS;
  unassignedTabCount?: number;
  highTabCount?: number;
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
  queueTotal,
  queueTotalUnavailableState,
  unassignedTabCount,
  highTabCount,
  outOfScopeSummary,
  onSelectVoc,
  onTabChange,
}: VocTriageScreenProps): React.ReactElement {
  const {
    state: queueState,
    liveQueue,
    optimisticRemove,
    optimisticRestore,
  } = useTriageQueue(items);

  // #527: the Finding action commits the triage decision (same PATCH as
  // Confirm) and then opens Finding creation, mirroring VocDetailPanel's
  // CreateFindingModal usage. Owned here, not in TriagePanel, since the
  // optimistic removal above unmounts TriagePanel for this VOC immediately.
  const [createFindingTarget, setCreateFindingTarget] = useState<{
    vocId: string;
    managedSystemId: string;
    analyticsAreaId: string | null;
    defaultTitle: string;
    defaultSeverity: FindingSeverity;
  } | null>(null);

  // Processed-count — number of VOCs optimistically removed (triaged/skipped)
  // in this session. Prototype ref: screen-voc-create.jsx:652-656 ("N건 처리됨").
  // Derived from the route-local triage queue reducer; no live server source
  // exists for a per-session processed count.
  const processedCount = queueState.optimisticallyRemoved.size;

  // Derive the selected VOC.
  //
  // Two cases must NOT be conflated (#383):
  //   1. The selection was in this queue at some point during the session and
  //      has since left it — triaged away optimistically, or dropped by the
  //      next server refetch. That is the "확정 & 다음 VOC" flow: auto-advance
  //      to the next item, exactly as before.
  //   2. The selection was never in this queue — a deep link whose target the
  //      queue predicate cannot show. Falling back here would silently put a
  //      DIFFERENT VOC's commit form in front of an operator who asked for a
  //      specific one, which is a wrong-record write hazard. Render the reason
  //      instead of a substitute.
  //
  // A ref (not derived state) records case 1 because the row is already gone
  // from `items` by the time the refetch lands — the queue itself can no longer
  // answer "was this ever mine?".
  const everInQueueRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const v of items) everInQueueRef.current.add(v.id);
  }, [items]);

  const selectedInQueue = liveQueue.find((v) => v.id === selectedId) ?? null;
  const deepLinkTargetMissing =
    selectedId !== null &&
    selectedInQueue === null &&
    !items.some((v) => v.id === selectedId) &&
    !everInQueueRef.current.has(selectedId);
  const selectedVoc = deepLinkTargetMissing ? null : (selectedInQueue ?? liveQueue[0] ?? null);
  const tabs: ListToolbarTab[] = TRIAGE_TABS.map((tab) => ({
    value: tab.value,
    label: tab.label,
    id: `triage-tab-${tab.value}`,
    controlsId: TRIAGE_QUEUE_PANEL_ID,
    ...(tab.value === 'unassigned' && unassignedTabCount !== undefined
      ? { badgeCount: unassignedTabCount }
      : {}),
    ...(tab.value === 'high' && highTabCount !== undefined ? { badgeCount: highTabCount } : {}),
  }));
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
        <div
          data-testid="triage-kicker"
          className="inline-flex items-center gap-1.5 pr-2.5 mr-1 h-[22px] border-r border-border-subtle shrink-0"
        >
          <span
            data-testid="triage-kicker-console"
            className="text-xs font-medium uppercase tracking-[0.04em] text-text-muted"
          >
            콘솔
          </span>
          <span className="text-[10px] text-text-muted" aria-hidden="true">
            ·
          </span>
          <span
            data-testid="triage-kicker-name"
            className="text-[13px] font-semibold text-text-secondary"
          >
            Triage
          </span>
        </div>
        <Flag size={14} className="text-text-warning shrink-0" aria-hidden="true" />
        <span className="text-sm font-semibold text-text-primary">{GLOSSARY.triageQueue}</span>
        {/* #680 separates the whole-queue total from the selected tab's count. */}
        <output
          data-testid="triage-queue-total"
          aria-label={queueTotalAccessibleLabel}
          className="ml-1 inline-flex items-center gap-1 h-5 px-1.5 rounded-sm text-[11px] font-medium bg-surface-canvas text-text-muted border border-border-subtle"
        >
          {queueTotal === undefined ? '— VOC' : `${queueTotal} VOC`}
        </output>
        <span className="text-xs text-text-muted ml-1" title="정렬: 미배정 → severity">
          미배정 → severity 순
        </span>
        {/* Processed-count progress — emerald/accent toned. Prototype ref:
            screen-voc-create.jsx:652-656 ("· N건 처리됨"). */}
        {processedCount > 0 && (
          <span data-testid="triage-processed-count" className="text-xs text-text-success ml-1">
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
          className="flex-1 min-w-0 overflow-y-auto border-r border-border-subtle"
        >
          <TriageQueue
            vocs={liveQueue}
            selectedId={selectedVoc?.id ?? null}
            onSelect={onSelectVoc}
            {...(outOfScopeSummary !== undefined ? { outOfScopeSummary } : {})}
          />
        </div>

        {/* Deep link target this queue cannot show (#383) — never silently
            swap in another VOC's commit form. */}
        {deepLinkTargetMissing && (
          <div className="w-[440px] shrink-0 border-l border-border-subtle p-6">
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
          <div className="w-[440px] shrink-0">
            <TriagePanel
              voc={selectedVoc}
              onAct={(kind, context) => {
                if (kind === 'finding' && context) {
                  setCreateFindingTarget({
                    vocId: context.vocId,
                    managedSystemId: context.managedSystemId,
                    analyticsAreaId: context.analyticsAreaId,
                    defaultTitle: context.title,
                    defaultSeverity: context.severity,
                  });
                }
              }}
              onOptimisticRemove={(vocId) => {
                const item = items.find((v) => v.id === vocId);
                if (!item) return;
                optimisticRemove(vocId, {
                  severity: item.severity,
                  ownerUserId: item.owner_user_id,
                  ownerTeamId: item.owner_team_id,
                  analyticsAreaId: item.analytics_area_id,
                });
              }}
              onOptimisticRestore={optimisticRestore}
            />
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
          onClose={() => setCreateFindingTarget(null)}
        />
      )}
    </div>
  );
}

VocTriageScreen.displayName = 'VocTriageScreen';
