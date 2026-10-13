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
        loading
          ? COPY.loading
          : item.content_state === 'available'
            ? item.quote_or_summary
            : COPY.withheld
      }
      meta={
        <span>
          {item.finding.display_id} · {item.finding.title}
        </span>
      }
      density="expanded"
      selected={selected}
      onClick={onSelect}
    >
      {!loading && <EvidenceMetadata item={item} />}
    </ObjectRow>
  );
}
