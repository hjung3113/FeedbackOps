import { CLUSTER_SUGGESTION_COPY as COPY } from '@/lib/copy/voc-cluster';
import { InternalLink } from '@/lib/router/InternalLink';
import type { VocClusterSuggestionItem } from '@fops/shared';
import {
  Button,
  DetailPanelHeader,
  PanelSectionTitle,
  RichContentRenderer,
  type TipTapDoc,
} from '@fops/ui';
import { useCallback } from 'react';

export function ClusterSuggestionPanel({
  item,
  notice,
  pending,
  blocked,
  onConfirm,
  onDiscard,
  onClose,
  onReload,
}: {
  item: VocClusterSuggestionItem | null;
  notice: string | null;
  pending: boolean;
  blocked: boolean;
  onConfirm: () => void;
  onDiscard: () => void;
  onClose: () => void;
  onReload: () => void;
}) {
  const focusNotice = useCallback((node: HTMLDivElement | null) => {
    node?.focus();
  }, []);
  return (
    <div data-testid="cluster-suggestion-panel">
      <DetailPanelHeader kind="cluster" extras={<h2>{COPY.tab}</h2>} onClose={onClose} />
      <div className="flex flex-col gap-5 p-5">
        {notice && (
          <div key={notice} role="alert" tabIndex={-1} ref={focusNotice}>
            <p>{notice}</p>
            <Button variant="secondary" size="sm" onClick={onReload}>
              {COPY.reload}
            </Button>
          </div>
        )}
        {item && (
          <>
            {item.vocs.map((voc) => (
              <section key={voc.id} className="flex flex-col gap-3">
                <PanelSectionTitle>
                  <InternalLink href={`/vocs/${voc.id}`}>{voc.display_id}</InternalLink>
                </PanelSectionTitle>
                <h3 className="text-sm font-medium text-text-primary">{voc.title}</h3>
                {voc.description_rich_content ? (
                  <RichContentRenderer
                    doc={voc.description_rich_content as TipTapDoc}
                    mode="internal"
                  />
                ) : (
                  <p className="text-sm text-text-muted">{COPY.noDescription}</p>
                )}
              </section>
            ))}
            <div className="flex gap-2">
              <Button variant="primary" size="sm" disabled={pending || blocked} onClick={onConfirm}>
                {COPY.confirm}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={pending || blocked}
                onClick={onDiscard}
              >
                {COPY.discard}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
