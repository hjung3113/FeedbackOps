import { CLUSTER_SUGGESTION_COPY as COPY } from '@/lib/copy/voc-cluster';
import { type VocClusterSuggestionItem, isTipTapDocStructurallyEmpty } from '@fops/shared';
import {
  Button,
  DetailPanelHeader,
  PanelSectionTitle,
  RichContentRenderer,
  type TipTapDoc,
} from '@fops/ui';
import { Link } from '@tanstack/react-router';
import { type RefObject, useEffect, useRef } from 'react';

export function ClusterSuggestionPanel({
  item,
  notice,
  noticeId,
  fallbackRef,
  pending,
  blocked,
  onConfirm,
  onDiscard,
  onClose,
  onReload,
}: {
  item: VocClusterSuggestionItem | null;
  notice: string | null;
  noticeId: number;
  fallbackRef: RefObject<HTMLDivElement | null>;
  pending: boolean;
  blocked: boolean;
  onConfirm: () => void;
  onDiscard: () => void;
  onClose: () => void;
  onReload: () => void;
}) {
  const noticeNode = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!notice || !noticeId) return;
    const target = noticeNode.current?.isConnected ? noticeNode.current : fallbackRef.current;
    if (target?.isConnected) target.focus();
  }, [notice, noticeId, fallbackRef]);
  return (
    <div data-testid="cluster-suggestion-panel">
      <DetailPanelHeader kind="cluster" id={COPY.tab} onClose={onClose} />
      <div className="flex flex-col gap-5 p-5">
        {notice && (
          <div role="alert" tabIndex={-1} ref={noticeNode}>
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
                  <Link
                    to="/vocs"
                    search={{ view: 'inbox', selected: voc.id }}
                    className="text-accent-primary underline underline-offset-2 hover:text-accent-primary/80"
                  >
                    {voc.display_id}
                  </Link>
                </PanelSectionTitle>
                <h3 className="text-sm font-medium text-text-primary">{voc.title}</h3>
                {!isTipTapDocStructurallyEmpty(voc.description_rich_content) ? (
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
