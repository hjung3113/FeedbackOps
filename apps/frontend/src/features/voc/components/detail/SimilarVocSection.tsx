import type { VocDetailEnvelope } from '@fops/shared';
import { PanelSectionTitle, ReporterStatusBadge, SeverityBadge } from '@fops/ui';
import { Sparkles } from 'lucide-react';
import type * as React from 'react';

export interface SimilarVocSectionProps {
  similar: VocDetailEnvelope['similar'] | undefined;
  similarCount: number;
  onSelect: (vocId: string) => void;
}

/** Keep the section, its anchor, and its navigation entry in lockstep. */
export function hasSimilarVocSection(
  similar: VocDetailEnvelope['similar'] | undefined,
  similarCount: number,
): similar is VocDetailEnvelope['similar'] {
  return similar !== undefined && similarCount > 0 && similar.items.length > 0;
}

/**
 * Authorized same-Managed-System peer preview. This is deliberately read-only:
 * cluster confirmation and dismissal remain owned by the cluster workflow.
 */
export function SimilarVocSection({
  similar,
  similarCount,
  onSelect,
}: SimilarVocSectionProps): React.ReactElement | null {
  if (!hasSimilarVocSection(similar, similarCount)) {
    return null;
  }

  return (
    <section className="mb-8" aria-label="유사 VOC">
      <div className="flex items-start justify-between gap-3">
        <PanelSectionTitle className="mb-3.5">유사 VOC</PanelSectionTitle>
        <span className="inline-flex items-center gap-1 rounded-full bg-accent-primary/10 px-2 py-0.5 text-xs font-medium text-accent-primary">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          Similarity {similarCount}
        </span>
      </div>
      <div className="overflow-hidden rounded-md bg-surface-canvas">
        {similar.items.slice(0, 3).map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-selected ${
              index > 0 ? 'border-t border-border-subtle' : ''
            }`}
            onClick={() => onSelect(item.id)}
          >
            <span className="shrink-0 font-mono text-xs text-text-muted">{item.display_id}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
              {item.title}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              {item.severity !== null && <SeverityBadge severity={item.severity} />}
              <ReporterStatusBadge status={item.reporter_facing_status} />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

SimilarVocSection.displayName = 'SimilarVocSection';
