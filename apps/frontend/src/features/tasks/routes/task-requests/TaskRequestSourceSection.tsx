import { FINDING_STATUS_LABELS } from '@/lib/copy/enum-labels';
import { shortId } from '@/lib/identity';
import type { FindingDto, TaskRequestDto } from '@fops/shared';
import { OutlineBadge, PanelSectionTitle } from '@fops/ui';

export function TaskRequestSourceSection({
  item,
  sourceFinding,
}: {
  item: TaskRequestDto;
  sourceFinding: FindingDto | undefined;
}) {
  if (item.source_type !== 'finding') return <PayloadSourceSection item={item} />;
  return (
    <section data-anchor="source" className="border-t border-border-subtle px-4 py-4">
      <PanelSectionTitle>출처 Finding</PanelSectionTitle>
      <div className="flex flex-col gap-2 rounded border border-border-subtle bg-surface-card p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">출처</span>
          <OutlineBadge>Finding</OutlineBadge>
        </div>
        <div className="flex flex-col gap-1">
          <div className="text-sm font-medium text-text-primary">
            {sourceFinding?.title ?? '출처 Finding'}
          </div>
          <div className="flex items-center gap-2">
            {sourceFinding && (
              <OutlineBadge>{FINDING_STATUS_LABELS[sourceFinding.status]}</OutlineBadge>
            )}
            <span className="shrink-0 whitespace-nowrap font-mono text-xs text-text-muted">
              {sourceFinding?.display_id ?? 'Finding'}
            </span>
            {!sourceFinding?.display_id && (
              <span className="font-mono text-xs text-text-muted">{shortId(item.source_id)}</span>
            )}
          </div>
        </div>
        <p className="text-sm leading-6 text-text-muted">{item.evidence_summary}</p>
      </div>
    </section>
  );
}

const PAYLOAD_SOURCE_KIND: Record<Exclude<TaskRequestDto['source_type'], 'finding'>, string> = {
  voc: 'VOC',
  voc_cluster: 'VOC Cluster',
};

// VOC / VOC Cluster origins render from the Task Request payload, whose serializer
// already decides whether the source text is exposed (VOC text only for the reporter
// or voc.read). No second read: identity shows only when both fields came through.
function PayloadSourceSection({ item }: { item: TaskRequestDto }) {
  const kind = PAYLOAD_SOURCE_KIND[item.source_type as keyof typeof PAYLOAD_SOURCE_KIND];
  const identity =
    item.source?.display_id !== undefined && item.source.title !== undefined
      ? { displayId: item.source.display_id, title: item.source.title }
      : null;
  return (
    <section data-anchor="source" className="border-t border-border-subtle px-4 py-4">
      <PanelSectionTitle>{`출처 ${kind}`}</PanelSectionTitle>
      <div className="flex flex-col gap-2 rounded border border-border-subtle bg-surface-card p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">출처</span>
          <OutlineBadge>{kind}</OutlineBadge>
        </div>
        {identity && (
          <div className="flex flex-col gap-1">
            <div className="text-sm font-medium text-text-primary">{identity.title}</div>
            <span className="shrink-0 whitespace-nowrap font-mono text-xs text-text-muted">
              {identity.displayId}
            </span>
          </div>
        )}
        {!identity && (
          <span className="font-mono text-xs text-text-muted">{shortId(item.source_id)}</span>
        )}
        <p className="text-sm leading-6 text-text-muted">{item.evidence_summary}</p>
      </div>
    </section>
  );
}
