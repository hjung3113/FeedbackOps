import {
  EVIDENCE_IMPORTANCE_LABELS,
  EVIDENCE_SENTIMENT_LABELS,
  EVIDENCE_SOURCE_TYPE_LABELS,
  SURVEY_TYPE_LABELS,
} from '@/lib/copy/enum-labels';
import { EVIDENCE_COPY } from '@/lib/copy/evidence';
import { InternalLink } from '@/lib/router/InternalLink';
import type { EvidenceInventoryItem } from '@fops/shared';

export function EvidenceSource({
  item,
  linked = false,
}: { item: EvidenceInventoryItem; linked?: boolean }) {
  if (item.content_state === 'withheld') return null;
  if (item.source_type === 'voc' && item.source) {
    if (linked)
      return (
        <InternalLink href={item.source.route} className="underline underline-offset-2">
          {item.source.display_id} · {item.source.title}
        </InternalLink>
      );
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
        {item.source.identity_protected ? ` · ${EVIDENCE_COPY.identityProtected}` : ''}
      </span>
    );
  }
  return null;
}
export function EvidenceContent({ item }: { item: EvidenceInventoryItem }) {
  return (
    <div className="flex flex-col gap-2">
      {item.content_state === 'available' ? (
        <p className="text-sm text-text-primary whitespace-pre-wrap break-words">
          {item.quote_or_summary}
        </p>
      ) : (
        <p className="text-sm text-text-muted italic">{EVIDENCE_COPY.withheld}</p>
      )}
      <EvidenceMetadata item={item} linked />
    </div>
  );
}

export function EvidenceMetadata({
  item,
  linked = false,
}: { item: EvidenceInventoryItem; linked?: boolean }) {
  return (
    <span className="text-xs text-text-muted">
      <span>{EVIDENCE_SOURCE_TYPE_LABELS[item.source_type]}</span>
      {item.content_state === 'available' && item.source_type !== 'note' && item.source && (
        <>
          {' '}
          · <EvidenceSource item={item} linked={linked} />
        </>
      )}
      {item.sentiment && <span> · {EVIDENCE_SENTIMENT_LABELS[item.sentiment]}</span>}
      {item.importance && <span> · {EVIDENCE_IMPORTANCE_LABELS[item.importance]}</span>}
    </span>
  );
}
