// VocTriageScreen — shell of the triage view.
//
// Prototype ref: screen-voc-create.jsx:589-697 (TriageScreen)
// Receives triage tab, managed system filter, selected VOC id, and handlers
// from TriageRoute. Composes TriageQueue + TriagePanel within WorkbenchShell
// scroll body.
//
// Chunk 1: queue rendered read-only. Mutation callbacks are stubs.

import * as React from 'react';
import type { VocListItem } from '@fops/shared';
import { Flag } from 'lucide-react';
import { useTriageQueue } from '../../hooks/useTriageQueue';
import { TriageQueue } from './TriageQueue';
import { TriagePanel } from './TriagePanel';

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
  const { liveQueue } = useTriageQueue(items);

  const selectedVoc = liveQueue.find((v) => v.id === selectedId) ?? liveQueue[0] ?? null;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar: title + tab strip */}
      <div className="flex items-center gap-2 px-5 h-[50px] border-b border-border-subtle bg-surface-detail shrink-0">
        <Flag size={14} className="text-text-warning shrink-0" aria-hidden="true" />
        <span className="text-sm font-semibold text-text-primary">Triage queue</span>
        <span className="ml-1 inline-flex items-center gap-1 h-5 px-1.5 rounded-sm text-[11px] font-medium bg-surface-canvas text-text-muted border border-border-subtle">
          {liveQueue.length} VOC
        </span>
        <span className="text-xs text-text-muted ml-1">정렬: 미배정 → severity</span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Tab strip */}
        <div className="flex items-center gap-0.5">
          {TRIAGE_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => { onTabChange(tab.value); }}
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
                // Chunk 3 will wire real mutation here
                if (kind === 'finding') {
                  // Per spec: "Finding 생성은 Slice 5에서 제공됩니다"
                  // Toast will be implemented in Chunk 3
                }
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

VocTriageScreen.displayName = 'VocTriageScreen';
