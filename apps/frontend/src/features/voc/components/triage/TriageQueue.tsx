// TriageQueue — scrollable left column containing triage rows.
// Renders OutOfScopeSummaryBanner above rows when outOfScopeSummary is provided.
// Renders TriageEmpty when queue is empty.

import * as React from 'react';
import type { VocListItem } from '@fops/shared';
import { TriageRow } from './TriageRow';
import { TriageEmpty } from './TriageEmpty';
import { OutOfScopeSummaryBanner } from './OutOfScopeSummaryBanner';

export interface TriageQueueProps {
  vocs: VocListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  outOfScopeSummary?: {
    count: number;
    severity_distribution: Record<string, number>;
  };
}

export function TriageQueue({
  vocs,
  selectedId,
  onSelect,
  outOfScopeSummary,
}: TriageQueueProps): React.ReactElement {
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {outOfScopeSummary !== undefined && (
        <OutOfScopeSummaryBanner
          count={outOfScopeSummary.count}
          severityDistribution={outOfScopeSummary.severity_distribution}
          className="px-4 py-3 border-b border-border-subtle"
        />
      )}

      {vocs.length === 0 ? (
        <TriageEmpty />
      ) : (
        vocs.map((voc) => (
          <TriageRow
            key={voc.id}
            voc={voc}
            selected={voc.id === selectedId}
            onSelect={() => { onSelect(voc.id); }}
          />
        ))
      )}
    </div>
  );
}

TriageQueue.displayName = 'TriageQueue';
