// TriageQueue — scrollable left column containing triage rows.
// Renders OutOfScopeSummaryBanner above rows when outOfScopeSummary is provided.
// #922: renders the queue-level pending state here (not at the route level) so
// the tablist above stays mounted and focused while a tab refetch runs.
// Renders TriageEmpty when queue is empty — queue-empty copy only when the
// whole queue is known to be empty (queueTotal === 0), tab-scoped copy
// otherwise (FIX1: an unknown total claims nothing about the whole queue).

import type { VocListItem } from '@fops/shared';
import type * as React from 'react';
import { OutOfScopeSummaryBanner } from './OutOfScopeSummaryBanner';
import { TriageEmpty } from './TriageEmpty';
import { TriageRow } from './TriageRow';

export interface TriageQueueProps {
  vocs: VocListItem[];
  selectedId: string | null;
  activeTab?: string;
  onSelect: (id: string) => void;
  /** #922: true while the active tab's queue query loads; shows the pending state in place of rows. */
  queuePending?: boolean;
  /** #922: whole-queue total; a tab can be empty while the queue is not. */
  queueTotal?: number;
  outOfScopeSummary?: {
    count: number;
    severity_distribution: Record<string, number>;
  };
}

export function TriageQueue({
  vocs,
  selectedId,
  activeTab,
  onSelect,
  queuePending,
  queueTotal,
  outOfScopeSummary,
}: TriageQueueProps): React.ReactElement {
  // #922 FIX1: an unknown total is not evidence of a truly empty queue — only
  // a known zero earns the whole-queue success copy; an unknown (or positive)
  // total gets the neutral tab-empty copy.
  const tabScopedEmpty = queueTotal !== 0;
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {outOfScopeSummary !== undefined && (
        <OutOfScopeSummaryBanner
          count={outOfScopeSummary.count}
          severityDistribution={outOfScopeSummary.severity_distribution}
          className="px-4 py-3 border-b border-border-subtle"
        />
      )}

      {queuePending === true ? (
        // #922 FIX1: <output> carries the implicit "status" role, so the
        // pending cue reaches assistive tech when the tab changes but rows
        // are still loading.
        <output className="flex items-center justify-center h-full">
          <span className="text-sm text-text-muted">불러오는 중…</span>
        </output>
      ) : vocs.length === 0 ? (
        <TriageEmpty {...(tabScopedEmpty ? { tabScoped: true } : {})} />
      ) : (
        vocs.map((voc) => (
          <TriageRow
            key={voc.id}
            voc={voc}
            showPostponedMarker={activeTab !== 'waiting'}
            selected={voc.id === selectedId}
            onSelect={() => {
              onSelect(voc.id);
            }}
          />
        ))
      )}
    </div>
  );
}

TriageQueue.displayName = 'TriageQueue';
