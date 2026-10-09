// TriageQueue — scrollable left column containing triage rows.
// Renders OutOfScopeSummaryBanner above rows when outOfScopeSummary is provided.
// #922: renders the queue-level pending state here (not at the route level) so
// the tablist above stays mounted and focused while a tab refetch runs.
// Renders TriageEmpty when queue is empty — tab-scoped copy when the whole
// queue still has rows, queue-empty copy when it is truly empty.

import type { VocListItem } from '@fops/shared';
import type * as React from 'react';
import { OutOfScopeSummaryBanner } from './OutOfScopeSummaryBanner';
import { TriageEmpty } from './TriageEmpty';
import { TriageRow } from './TriageRow';

export interface TriageQueueProps {
  vocs: VocListItem[];
  selectedId: string | null;
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
  onSelect,
  queuePending,
  queueTotal,
  outOfScopeSummary,
}: TriageQueueProps): React.ReactElement {
  const tabScopedEmpty = queueTotal !== undefined && queueTotal > 0;
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
        <div className="flex items-center justify-center h-full">
          <span className="text-sm text-text-muted">불러오는 중…</span>
        </div>
      ) : vocs.length === 0 ? (
        <TriageEmpty {...(tabScopedEmpty ? { tabScoped: true } : {})} />
      ) : (
        vocs.map((voc) => (
          <TriageRow
            key={voc.id}
            voc={voc}
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
