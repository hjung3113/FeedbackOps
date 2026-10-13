import {
  EVIDENCE_IMPORTANCE_LABELS,
  EVIDENCE_SENTIMENT_LABELS,
  EVIDENCE_SOURCE_TYPE_LABELS,
  SURVEY_TYPE_LABELS,
} from '@/lib/copy/enum-labels';
import { EVIDENCE_COPY } from '@/lib/copy/evidence';
import type { EvidenceInventoryItem } from '@fops/shared';

export function EvidenceSource({ item }: { item: EvidenceInventoryItem }) {
  if (item.content_state === 'withheld') return null;
  if (item.source_type === 'voc' && item.source) {
    return (
      <span>
        {item.source.display_id} · {item.source.title}
      </span>
    );
  }
  if (item.source_type === 'survey_response' && item.source) {
    return (
      <span>
        {item.source.survey_display_id} · {SURVEY_TYPE_LABELS[item.source.survey_type]} ·{' '}
        {item.source.question_label}
        {item.source.identity_protected ? ' · 응답자 보호' : ''}
      </span>
    );
  }
  return null;
}
export function EvidenceContent({ item }: { item: EvidenceInventoryItem }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-text-primary whitespace-pre-wrap break-words">
        {item.content_state === 'available' ? item.quote_or_summary : EVIDENCE_COPY.withheld}
      </p>
      <EvidenceMetadata item={item} />
    </div>
  );
}

export function EvidenceMetadata({ item }: { item: EvidenceInventoryItem }) {
  return (
    <div className="flex flex-wrap gap-2 text-xs text-text-muted">
      <span>{EVIDENCE_SOURCE_TYPE_LABELS[item.source_type]}</span>
      <EvidenceSource item={item} />
      {item.sentiment && <span>{EVIDENCE_SENTIMENT_LABELS[item.sentiment]}</span>}
      {item.importance && <span>{EVIDENCE_IMPORTANCE_LABELS[item.importance]}</span>}
    </div>
  );
}
