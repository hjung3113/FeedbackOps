import { EVIDENCE_COPY as COPY } from '@/lib/copy/evidence';
import type { EvidenceInventoryItem } from '@fops/shared';
import { ObjectRow } from '@fops/ui';
import type { Ref } from 'react';
import { EvidenceMetadata } from './EvidenceContent';

export function EvidenceRow({
  item,
  selected,
  loading,
  rowRef,
  onSelect,
}: {
  item: EvidenceInventoryItem;
  selected: boolean;
  loading: boolean;
  rowRef: Ref<HTMLDivElement>;
  onSelect: () => void;
}) {
  return (
    <ObjectRow
      ref={rowRef}
      title={
        loading ? (
          COPY.loading
        ) : item.content_state === 'available' ? (
          item.quote_or_summary
        ) : (
          <span className="text-text-muted italic">{COPY.withheld}</span>
        )
      }
      meta={
        <span className="min-w-0 truncate">
          {item.finding.display_id} · {item.finding.title}
          {!loading && (
            <>
              {' '}
              · <EvidenceMetadata item={item} />
            </>
          )}
        </span>
      }
      selected={selected}
      onClick={onSelect}
    />
  );
}
