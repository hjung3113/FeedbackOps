import type {
  EvidenceHighlightDto,
  EvidenceHighlightImportance,
  EvidenceHighlightSentiment,
  EvidenceHighlightSourceType,
} from '@fops/shared';
import { EmptyState, Skeleton } from '@fops/ui';
import type * as React from 'react';
import { useEvidenceHighlights } from '../../hooks/useEvidenceHighlights';
import { FitBadge } from './detail-primitives';

export const EVIDENCE_SOURCE_TYPE_LABEL: Record<EvidenceHighlightSourceType, string> = {
  voc: 'VOC',
  survey_response: 'Survey',
  note: 'Note',
};
// ── Sentiment / importance badge helpers ─────────────────────────────────────

const SENTIMENT_LABEL: Record<EvidenceHighlightSentiment, string> = {
  negative: '부정',
  neutral: '중립',
  positive: '긍정',
};

const IMPORTANCE_LABEL: Record<EvidenceHighlightImportance, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

// ── Single Evidence Highlight row ────────────────────────────────────────────

interface EvidenceHighlightRowProps {
  highlight: EvidenceHighlightDto;
}

function EvidenceHighlightRow({ highlight }: EvidenceHighlightRowProps): React.ReactElement {
  // quote_or_summary is OMITTED from the DTO when the source is unreadable (withheld rule).
  const isWithheld = highlight.quote_or_summary === undefined;

  return (
    <div
      className="rounded-md border border-border-subtle bg-surface-card p-4 flex flex-col gap-2"
      data-testid="evidence-highlight-row"
      data-evidence-id={highlight.id}
    >
      {/* Source reference */}
      <div className="flex items-center gap-2 flex-wrap">
        <FitBadge data-testid="evidence-source-type">
          {EVIDENCE_SOURCE_TYPE_LABEL[highlight.source_type]}
        </FitBadge>
        {highlight.source_type !== 'survey_response' && highlight.source_id !== null && (
          <span className="text-xs text-text-muted font-mono" data-testid="evidence-source-id">
            {highlight.source_id.slice(0, 8)}
          </span>
        )}
        {highlight.sentiment !== null && (
          <FitBadge data-testid="evidence-sentiment">
            {SENTIMENT_LABEL[highlight.sentiment]}
          </FitBadge>
        )}
        {highlight.importance !== null && (
          <FitBadge data-testid="evidence-importance">
            {IMPORTANCE_LABEL[highlight.importance]}
          </FitBadge>
        )}
      </div>

      {/* Quote or withheld state */}
      {isWithheld ? (
        <p className="text-sm text-text-muted italic" data-testid="evidence-withheld">
          [원문 접근 권한 없음 — 내용이 숨겨졌습니다.]
        </p>
      ) : (
        <p className="text-sm text-text-primary whitespace-pre-wrap" data-testid="evidence-quote">
          {highlight.quote_or_summary}
        </p>
      )}
    </div>
  );
}

// ── Evidence Highlights section (loading / empty / list) ─────────────────────

interface EvidenceHighlightsSectionProps {
  findingId: string;
  evidenceCount: number;
}

export function EvidenceHighlightsSection({
  findingId,
}: EvidenceHighlightsSectionProps): React.ReactElement {
  const { data: highlights, isLoading, isError } = useEvidenceHighlights(findingId);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2" aria-label="Evidence 불러오는 중">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (isError) {
    return <p className="text-sm text-feedback-error">Evidence 목록을 불러오지 못했습니다.</p>;
  }

  const items = highlights ?? [];

  if (items.length === 0) {
    return (
      <div data-testid="evidence-empty-state">
        <EmptyState
          size="sm"
          title="증거 하이라이트가 없습니다."
          body="Evidence 추가 버튼으로 증거를 추가하세요."
          className="rounded-md border border-dashed border-border-subtle bg-surface-card px-6"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="evidence-highlight-list">
      {items.map((h) => (
        <EvidenceHighlightRow key={h.id} highlight={h} />
      ))}
    </div>
  );
}
