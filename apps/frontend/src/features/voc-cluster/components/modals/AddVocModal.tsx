// Add existing VOCs to a VOC Cluster. Mounted only when the detail panel is canMutate and stays
// mounted with open=false, so every piece of picker state lives in AddVocPicker, which exists only
// while the dialog is open: any exit unmounts it, and a POST that settles afterwards writes into
// the dead session, never a later one.

import type { SameManagedSystemCandidatePeerDto } from '@fops/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SEVERITY_LABELS,
  SearchInput,
  Skeleton,
} from '@fops/ui';
import type * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { ListLoadMore } from '@/components/ListLoadMore';
import { useAddClusterMember } from '@/features/voc-cluster/hooks/useAddClusterMember';
import { useCandidatePeers } from '@/features/voc-cluster/hooks/useCandidatePeers';
import { type ApiError, errorMapper } from '@/lib/api';
import { LIST_SEARCH_EMPTY_LABEL, LIST_SEARCH_PLACEHOLDER } from '@/lib/copy/list-search';
import { REPORTER_STATUS_LABELS } from '@/lib/copy/reporter-status-labels';
import { searchDebounceMs } from '@/lib/forms/search-debounce';
import { shortId } from '@/lib/identity';

type Candidate = Omit<SameManagedSystemCandidatePeerDto, 'display_id'> & {
  display_id: string | null;
};

function severityLabel(severity: Candidate['severity']): string {
  return severity === null ? '미지정' : SEVERITY_LABELS[severity];
}

function statusLabel(status: string): string {
  return (REPORTER_STATUS_LABELS as Record<string, string>)[status] ?? status;
}

function addToSet(set: ReadonlySet<string>, id: string): Set<string> {
  return new Set(set).add(id);
}

function removeFromSet(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  next.delete(id);
  return next;
}

export function AddVocModal({
  open,
  clusterId,
  onClose,
  returnFocusRef,
}: {
  open: boolean;
  clusterId: string;
  onClose: () => void;
  returnFocusRef?: React.RefObject<HTMLButtonElement | null>;
}): React.ReactElement {
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent
        data-testid="add-voc-modal"
        onCloseAutoFocus={(event) => {
          const trigger = returnFocusRef?.current;
          if (trigger?.isConnected && !trigger.disabled) {
            event.preventDefault();
            trigger.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>VOC 추가</DialogTitle>
        </DialogHeader>
        {open && <AddVocPicker clusterId={clusterId} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function AddVocPicker({
  clusterId,
  onClose,
}: {
  clusterId: string;
  onClose: () => void;
}): React.ReactElement {
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(new Map());
  const mounted = useRef(true);
  // Click-time guard: two clicks in one tick both see the same `pending` state snapshot.
  const inFlight = useRef(new Set<string>());
  const { mutateAsync } = useAddClusterMember();
  const candidatePeers = useCandidatePeers(clusterId, q);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setQ(draft.trim()), searchDebounceMs(draft));
    return () => window.clearTimeout(timeoutId);
  }, [draft]);

  // Rows stay where they were for the session: a refetch after an add no longer returns the
  // member (the backend excludes it), but its row must not vanish or shift the list.
  const [view, setView] = useState<{
    data: typeof candidatePeers.data;
    rows: Candidate[];
  }>({ data: undefined, rows: [] });
  if (view.data !== candidatePeers.data) {
    const fresh: Candidate[] = candidatePeers.data?.pages.flatMap((page) => page.candidates) ?? [];
    const freshIds = new Set(fresh.map((candidate) => candidate.voc_id));
    const kept =
      candidatePeers.data === undefined
        ? []
        : view.rows.filter(
            (row) => freshIds.has(row.voc_id) || added.has(row.voc_id) || pending.has(row.voc_id),
          );
    const keptIds = new Set(kept.map((row) => row.voc_id));
    setView({
      data: candidatePeers.data,
      rows: [...kept, ...fresh.filter((candidate) => !keptIds.has(candidate.voc_id))],
    });
  }
  const rows = view.rows;

  async function handleAdd(candidate: Candidate) {
    const vocId = candidate.voc_id;
    if (inFlight.current.has(vocId) || added.has(vocId)) return;
    inFlight.current.add(vocId);
    setPending((current) => addToSet(current, vocId));
    setErrors((current) => {
      const next = new Map(current);
      next.delete(vocId);
      return next;
    });
    try {
      await mutateAsync({ clusterId, vocId });
      if (!mounted.current) return;
      setAdded((current) => addToSet(current, vocId));
      toast.success('VOC가 Cluster에 추가되었습니다.');
    } catch (err) {
      if (!mounted.current) return;
      const message = errorMapper((err as ApiError).envelope).message;
      setErrors((current) => new Map(current).set(vocId, message));
      toast.error(message);
    } finally {
      inFlight.current.delete(vocId);
      if (mounted.current) setPending((current) => removeFromSet(current, vocId));
    }
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        <SearchInput placeholder={LIST_SEARCH_PLACEHOLDER} value={draft} onValueChange={setDraft} />
        {candidatePeers.isLoading ? (
          <Skeleton className="h-9 w-full" data-testid="candidate-peers-loading" />
        ) : candidatePeers.isError && rows.length === 0 ? (
          <p className="text-sm text-accent-danger" data-testid="candidate-peers-error">
            추가 가능한 VOC를 불러오지 못했습니다.
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-text-muted" data-testid="candidate-peers-empty">
            {LIST_SEARCH_EMPTY_LABEL}
          </p>
        ) : (
          <ul
            className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto"
            data-testid="add-voc-candidates"
          >
            {rows.map((candidate) => {
              const label = candidate.display_id ?? 'VOC';
              const isAdded = added.has(candidate.voc_id);
              const isPending = pending.has(candidate.voc_id);
              const error = errors.get(candidate.voc_id);
              return (
                <li
                  key={candidate.voc_id}
                  data-testid={`add-voc-candidate-${candidate.voc_id}`}
                  className="flex flex-col gap-1 rounded-md border border-border-subtle px-2 py-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 flex-col items-start text-sm">
                      <span>
                        {label} · {candidate.title} · {severityLabel(candidate.severity)} ·{' '}
                        {statusLabel(candidate.reporter_facing_status)}
                      </span>
                      {!candidate.display_id && (
                        <span className="font-mono text-xs text-text-muted">
                          {shortId(candidate.voc_id)}
                        </span>
                      )}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant={isAdded ? 'secondary' : 'outline'}
                      disabled={isPending || isAdded}
                      aria-label={isAdded ? `${label} 추가됨` : `${label} 추가`}
                      onClick={() => void handleAdd(candidate)}
                      data-testid={`add-voc-add-${candidate.voc_id}`}
                    >
                      {isAdded ? '추가됨' : '추가'}
                    </Button>
                  </div>
                  {error && (
                    <p
                      role="alert"
                      data-testid={`add-voc-error-${candidate.voc_id}`}
                      className="text-sm text-accent-danger"
                    >
                      {error}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <ListLoadMore
          hasMore={candidatePeers.hasNextPage}
          loadingMore={candidatePeers.isFetchingNextPage}
          failed={candidatePeers.isFetchNextPageError}
          onLoadMore={() => void candidatePeers.fetchNextPage()}
        />
      </div>
      <DialogFooter spacing="compact">
        <Button type="button" variant="secondary" onClick={onClose} data-testid="add-voc-cancel">
          닫기
        </Button>
      </DialogFooter>
    </>
  );
}
