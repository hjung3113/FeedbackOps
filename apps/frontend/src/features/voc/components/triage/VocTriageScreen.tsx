// VocTriageScreen — shell of the triage view.
//
// Prototype ref: screen-voc-create.jsx:589-697 (TriageScreen)
// Receives triage tab, managed system filter, selected VOC id, and handlers
// from TriageRoute. Composes TriageQueue + TriagePanel within WorkbenchShell
// scroll body.
//
// C3.2: passes optimisticRemove + optimisticRestore from useTriageQueue into
// TriagePanel so the panel can drive queue side-effects on mutation.

import type { VocListItem } from '@fops/shared';
import { Flag } from 'lucide-react';
import type * as React from 'react';
import { useTriageQueue } from '../../hooks/useTriageQueue';
import { TriagePanel } from './TriagePanel';
import { TriageQueue } from './TriageQueue';

export type TriageTab = 'unassigned' | 'untriaged' | 'high' | 'waiting';

export interface VocTriageScreenProps {
  items: VocListItem[];
  selectedId: string | null;
  activeTab: TriageTab;
  outOfScopeSummary?: {
    count: number;
    severity_distribution: Record<string, number>;
  };
  onSelectVoc: (id: string) => void;
  onTabChange: (tab: TriageTab) => void;
}

const TRIAGE_TABS: { value: TriageTab; label: string }[] = [
  { value: 'unassigned', label: '미배정' },
  { value: 'untriaged', label: '미트리아지' },
  { value: 'high', label: '높은 심각도' },
  { value: 'waiting', label: '보류' },
];

export function VocTriageScreen({
  items,
  selectedId,
  activeTab,
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

  // Processed-count — number of VOCs optimistically removed (triaged/skipped)
  // in this session. Prototype ref: screen-voc-create.jsx:652-656 ("N건 처리됨").
  // Derived from the route-local triage queue reducer; no live server source
  // exists for a per-session processed count.
  const processedCount = queueState.optimisticallyRemoved.size;

  // Derive the selected VOC — when the current selection is optimistically removed,
  // auto-advance to the next item in the live queue.
  const selectedVoc = liveQueue.find((v) => v.id === selectedId) ?? liveQueue[0] ?? null;

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
            Console
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
        <span className="text-sm font-semibold text-text-primary">Triage queue</span>
        <span className="ml-1 inline-flex items-center gap-1 h-5 px-1.5 rounded-sm text-[11px] font-medium bg-surface-canvas text-text-muted border border-border-subtle">
          {liveQueue.length} VOC
        </span>
        <span className="text-xs text-text-muted ml-1">정렬: 미배정 → severity</span>
        {/* Processed-count progress — emerald/accent toned. Prototype ref:
            screen-voc-create.jsx:652-656 ("· N건 처리됨"). */}
        {processedCount > 0 && (
          <span data-testid="triage-processed-count" className="text-xs text-text-success ml-1">
            · {processedCount}건 처리됨
          </span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Tab strip */}
        <div className="flex items-center gap-0.5">
          {TRIAGE_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => {
                onTabChange(tab.value);
              }}
              className={
                activeTab === tab.value
                  ? 'h-7 px-2.5 rounded-md text-[13px] font-medium text-text-primary bg-surface-popover'
                  : 'h-7 px-2.5 rounded-md text-[13px] font-medium text-text-muted hover:bg-surface-card hover:text-text-primary'
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body: queue (left) + panel (right) */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: queue list */}
        <div className="flex-1 min-w-0 overflow-y-auto border-r border-border-subtle">
          <TriageQueue
            vocs={liveQueue}
            selectedId={selectedVoc?.id ?? null}
            onSelect={onSelectVoc}
            {...(outOfScopeSummary !== undefined ? { outOfScopeSummary } : {})}
          />
        </div>

        {/* Right: detail panel (always rendered when queue non-empty) */}
        {selectedVoc !== null && (
          <div className="w-[440px] shrink-0">
            <TriagePanel
              voc={selectedVoc}
              onAct={(kind) => {
                // Non-mutation side effects per kind
                if (kind === 'finding') {
                  // D-3.4: Toast "Finding 생성은 Slice 5에서 제공됩니다" is handled
                  // inside TriagePanel. No navigation here (Slice 5).
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
    </div>
  );
}

VocTriageScreen.displayName = 'VocTriageScreen';
