import { ListStateMessage } from '@/components/ListStateMessage';
import { mapUnknownError } from '@/lib/api/errorMapper';
import { mintIdempotencyKey } from '@/lib/api/idempotency';
import { ApiError } from '@/lib/api/types';
import { CLUSTER_SUGGESTION_COPY as COPY } from '@/lib/copy/voc-cluster';
import { InternalLink } from '@/lib/router/InternalLink';
import type {
  DiscardVocClusterSuggestionResponse,
  VocClusterSuggestionItem,
  VocClusterSuggestionsResponse,
} from '@fops/shared';
import { Button, ObjectRow, PermissionBlockedPanel, SkeletonRows } from '@fops/ui';
import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { clusterSuggestionsKey, useClusterSuggestions } from '../../hooks/useClusterSuggestions';
import { useConfirmClusterSuggestion } from '../../hooks/useConfirmClusterSuggestion';
import { useDiscardClusterSuggestion } from '../../hooks/useDiscardClusterSuggestion';
import { useRestoreClusterSuggestion } from '../../hooks/useRestoreClusterSuggestion';
import { ClusterSuggestionPanel } from './ClusterSuggestionPanel';

type ReviewedSuggestion = Pick<
  VocClusterSuggestionItem,
  'id' | 'revision' | 'embedding_version' | 'source_hashes'
>;
type SuggestionRow =
  | { kind: 'pair'; item: VocClusterSuggestionItem }
  | { kind: 'undo'; item: ReviewedSuggestion; undo: UndoRecord };
type UndoRecord = {
  item: ReviewedSuggestion;
  position: number;
  result: DiscardVocClusterSuggestionResponse;
};
type FocusTarget = { kind: 'row' | 'undo' | 'list'; id: string };
function reviewedBody(item: ReviewedSuggestion, revision = item.revision) {
  return {
    expected_revision: revision,
    embedding_version: item.embedding_version,
    source_hashes: item.source_hashes,
  };
}
function reviewedFingerprint(item: ReviewedSuggestion) {
  return JSON.stringify({ id: item.id, body: reviewedBody(item) });
}
function denied(error: unknown) {
  return error instanceof ApiError && (error.status === 403 || error.status === 404);
}

/** Mounted only for the fourth tab; query data never owns undo or safe notices. */
export function ClusterSuggestionSession({
  managedSystemId,
  actorContext,
  children,
  onSlots,
}: {
  managedSystemId?: string | undefined;
  actorContext?: string | undefined;
  onSlots?: (slots: { panel: ReactNode; count: number | undefined }) => void;
  children: (slots: { list: ReactNode; panel: ReactNode; count: number | undefined }) => ReactNode;
}) {
  const query = useClusterSuggestions(managedSystemId, actorContext);
  const client = useQueryClient();
  const { mutateAsync: confirmSuggestion } = useConfirmClusterSuggestion();
  const { mutateAsync: discardSuggestion } = useDiscardClusterSuggestion();
  const { mutateAsync: restoreSuggestion } = useRestoreClusterSuggestion();
  const refetch = query.refetch;
  const readError = query.isError;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [undos, setUndos] = useState<UndoRecord[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [{ message: notice, eventId: noticeId }, setNoticeEvent] = useState<{
    message: string | null;
    eventId: number;
  }>({ message: null, eventId: 0 });
  const setNotice = useCallback((message: string | null) => {
    setNoticeEvent((current) => ({
      message,
      eventId: current.eventId + (message === null ? 0 : 1),
    }));
  }, []);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  const alive = useRef(false);
  const locks = useRef(new Set<string>());
  const intents = useRef(new Map<string, { fingerprint: string; key: string }>());
  const rowNodes = useRef(new Map<string, HTMLDivElement>());
  const undoNodes = useRef(new Map<string, HTMLButtonElement>());
  const listNode = useRef<HTMLDivElement>(null);
  const readDenied = query.isError && denied(query.error);
  const items = useMemo(
    () => (readDenied ? [] : (query.data?.items ?? []).filter((item) => !removed.has(item.id))),
    [readDenied, query.data, removed],
  );
  const rows = useMemo(() => {
    const rows: SuggestionRow[] = items
      .filter((entry) => !undos.some((undo) => undo.item.id === entry.id))
      .map((entry) => ({ kind: 'pair', item: entry }));
    for (const undo of [...undos].sort((a, b) => a.position - b.position))
      rows.splice(Math.max(0, undo.position), 0, { kind: 'undo', item: undo.item, undo });
    return rows;
  }, [items, undos]);
  const item = items.find((candidate) => candidate.id === selectedId) ?? null;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      locks.current.clear();
      intents.current.clear();
    };
  }, []);
  useEffect(() => {
    if (!readDenied) return;
    setUndos([]);
    setSelectedId(null);
    setNotice(mapUnknownError(query.error).message);
    intents.current.clear();
  }, [readDenied, query.error, setNotice]);
  useEffect(() => {
    if (
      query.isSuccess &&
      selectedId &&
      !query.data.items.some((entry) => entry.id === selectedId)
    ) {
      setSelectedId(null);
      if (!locks.current.has(selectedId)) intents.current.delete(selectedId);
    }
  }, [query.isSuccess, query.data, selectedId]);
  useEffect(() => {
    const cancelTimers = undos.map((undo) => {
      let timer: ReturnType<typeof setTimeout>;
      const expire = () => {
        const remaining = Date.parse(undo.result.undo_until) - Date.now();
        if (remaining > 0) {
          timer = setTimeout(expire, remaining);
          return;
        }
        if (undoNodes.current.get(undo.item.id) === document.activeElement)
          setFocus({ kind: 'list', id: '' });
        setUndos((current) => current.filter((entry) => entry.item.id !== undo.item.id));
        intents.current.delete(undo.item.id);
      };
      timer = setTimeout(expire, Math.max(0, Date.parse(undo.result.undo_until) - Date.now()));
      return () => clearTimeout(timer);
    });
    return () => {
      for (const cancel of cancelTimers) cancel();
    };
  }, [undos]);
  useEffect(() => {
    if (!focus) return;
    const target =
      focus.kind === 'row'
        ? rowNodes.current.get(focus.id)
        : focus.kind === 'undo'
          ? undoNodes.current.get(focus.id)
          : listNode.current;
    if (target) {
      target.focus();
      setFocus(null);
      return;
    }
    const fallback = setTimeout(() => {
      listNode.current?.focus();
      setFocus(null);
    }, 1000);
    return () => clearTimeout(fallback);
  }, [focus]);

  const removePair = useCallback(
    (id: string) => {
      setRemoved((current) => new Set(current).add(id));
      setUndos((current) => current.filter((entry) => entry.item.id !== id));
      client.setQueryData<VocClusterSuggestionsResponse>(
        clusterSuggestionsKey(managedSystemId, actorContext),
        (data) =>
          data?.available
            ? { ...data, items: data.items.filter((entry) => entry.id !== id) }
            : data,
      );
    },
    [client, managedSystemId, actorContext],
  );
  const actOn = useCallback(
    async (
      action: 'confirm' | 'discard' | 'restore',
      captured: ReviewedSuggestion,
      undo?: UndoRecord,
    ) => {
      if (locks.current.has(captured.id)) return;
      if (action === 'restore' && !undo) return;
      if (action !== 'restore' && (readError || blocked.has(reviewedFingerprint(captured)))) return;
      if (undo && Date.now() >= Date.parse(undo.result.undo_until)) {
        setUndos((current) => current.filter((entry) => entry.item.id !== captured.id));
        return;
      }
      locks.current.add(captured.id);
      setPending((current) => new Set(current).add(captured.id));
      const body =
        action === 'discard'
          ? { expected_revision: captured.revision }
          : reviewedBody(captured, undo?.result.revision ?? captured.revision);
      const fingerprint = JSON.stringify({ suggestionId: captured.id, action, exactBody: body });
      const previous = intents.current.get(captured.id);
      const key = previous?.fingerprint === fingerprint ? previous.key : mintIdempotencyKey();
      intents.current.set(captured.id, { fingerprint, key });
      const position = rows.findIndex((entry) => entry.item.id === captured.id);
      try {
        const intent = { id: captured.id, idempotencyKey: key, actorContext };
        if (action === 'confirm') {
          const result = await confirmSuggestion({ ...intent, body: reviewedBody(captured) });
          if (!alive.current) return;
          removePair(captured.id);
          setSelectedId(null);
          setNotice(null);
          const nextId = items.find((entry) => entry.id !== captured.id)?.id;
          setFocus(nextId ? { kind: 'row', id: nextId } : null);
          toast.success(COPY.created, {
            description: (
              <InternalLink
                href={`/voc-clusters/${result.voc_cluster_id}`}
                ref={(node) => {
                  if (node && alive.current) node.focus();
                }}
              >
                {COPY.clusterLink}
              </InternalLink>
            ),
          });
        } else if (action === 'discard') {
          const result = await discardSuggestion({
            ...intent,
            body: { expected_revision: captured.revision },
          });
          if (!alive.current) return;
          setRemoved((current) => new Set(current).add(captured.id));
          setSelectedId(null);
          setNotice(null);
          if (Date.parse(result.undo_until) > Date.now()) {
            setUndos((current) => [
              ...current.filter((entry) => entry.item.id !== captured.id),
              {
                item: {
                  id: captured.id,
                  revision: captured.revision,
                  embedding_version: captured.embedding_version,
                  source_hashes: captured.source_hashes,
                },
                position,
                result,
              },
            ]);
            setFocus({ kind: 'undo', id: captured.id });
          } else setFocus({ kind: 'list', id: '' });
        } else {
          await restoreSuggestion({
            ...intent,
            body: reviewedBody(captured, undo?.result.revision ?? captured.revision),
          });
          if (!alive.current) return;
          setUndos((current) => current.filter((entry) => entry.item.id !== captured.id));
          setRemoved((current) => {
            const next = new Set(current);
            next.delete(captured.id);
            return next;
          });
          setFocus({ kind: 'row', id: captured.id });
        }
        intents.current.delete(captured.id);
      } catch (error) {
        if (!alive.current) return;
        setNotice(mapUnknownError(error).message);
        if (error instanceof ApiError && error.code === 'conflict.stale_write') {
          setBlocked((current) => new Set(current).add(reviewedFingerprint(captured)));
          setNotice(COPY.stale);
          void refetch();
        }
        if (denied(error)) {
          removePair(captured.id);
          setSelectedId(null);
        }
        if (
          action === 'restore' &&
          error instanceof ApiError &&
          [403, 404, 409].includes(error.status)
        ) {
          setUndos((current) => current.filter((entry) => entry.item.id !== captured.id));
        }
        if (error instanceof ApiError && error.status >= 400 && error.status < 500)
          intents.current.delete(captured.id);
      } finally {
        locks.current.delete(captured.id);
        if (alive.current)
          setPending((current) => {
            const next = new Set(current);
            next.delete(captured.id);
            return next;
          });
      }
    },
    [
      readError,
      actorContext,
      blocked,
      rows,
      items,
      confirmSuggestion,
      discardSuggestion,
      restoreSuggestion,
      removePair,
      refetch,
      setNotice,
    ],
  );

  const list = (
    <div ref={listNode} tabIndex={-1} aria-label={COPY.tab}>
      {query.isPending ? (
        <SkeletonRows count={3} size="compact" />
      ) : readDenied ? (
        <PermissionBlockedPanel
          state="denied"
          category={COPY.tab}
          reason={COPY.denied}
          className="m-4"
        />
      ) : query.isError ? (
        <ListStateMessage
          variant="error"
          title={COPY.error}
          body={COPY.retryBody}
          action={{ label: COPY.retry, onClick: () => void refetch() }}
        />
      ) : query.data?.available === false ? (
        <ListStateMessage variant="empty" title={COPY.unavailable} body={COPY.unavailableBody} />
      ) : rows.length === 0 ? (
        <ListStateMessage variant="empty" title={COPY.empty} body={COPY.emptyBody} />
      ) : (
        rows.map((row) =>
          row.kind === 'undo' ? (
            <div
              key={row.item.id}
              className="flex items-center gap-3 border-b border-border-subtle px-5 py-3"
            >
              <output className="text-sm text-text-muted">{COPY.discarded}</output>
              <Button
                variant="secondary"
                size="sm"
                disabled={pending.has(row.item.id)}
                ref={(node) => {
                  if (node) {
                    undoNodes.current.set(row.item.id, node);
                    if (focus?.kind === 'undo' && focus.id === row.item.id) {
                      node.focus();
                      setFocus(null);
                    }
                  } else undoNodes.current.delete(row.item.id);
                }}
                onClick={() => void actOn('restore', row.item, row.undo)}
              >
                {COPY.undo}
              </Button>
            </div>
          ) : (
            <ObjectRow
              key={row.item.id}
              selected={selectedId === row.item.id}
              title={`${row.item.vocs[0].display_id} · ${row.item.vocs[0].title}`}
              meta={`${row.item.vocs[1].display_id} · ${row.item.vocs[1].title}`}
              density="default"
              ref={(node) => {
                if (node) {
                  rowNodes.current.set(row.item.id, node);
                  if (focus?.kind === 'row' && focus.id === row.item.id) {
                    node.focus();
                    setFocus(null);
                  }
                } else rowNodes.current.delete(row.item.id);
              }}
              onClick={() => {
                setSelectedId(row.item.id);
                if (!blocked.has(reviewedFingerprint(row.item))) setNotice(null);
                if (selectedId !== row.item.id) intents.current.delete(row.item.id);
              }}
            />
          ),
        )
      )}
    </div>
  );
  const panel = useMemo(
    () =>
      item || notice ? (
        <ClusterSuggestionPanel
          item={readDenied ? null : item}
          notice={notice}
          noticeId={noticeId}
          fallbackRef={listNode}
          pending={item ? pending.has(item.id) : false}
          blocked={readError || (item ? blocked.has(reviewedFingerprint(item)) : false)}
          onConfirm={() => {
            if (item) void actOn('confirm', item);
          }}
          onDiscard={() => {
            if (item) void actOn('discard', item);
          }}
          onClose={() => {
            setSelectedId(null);
            setNotice(null);
            setFocus({ kind: 'list', id: '' });
          }}
          onReload={() => void refetch()}
        />
      ) : null,
    [item, notice, noticeId, readDenied, pending, blocked, readError, actOn, refetch, setNotice],
  );
  const count = query.isSuccess
    ? items.filter((entry) => !undos.some((undo) => undo.item.id === entry.id)).length
    : undefined;
  useEffect(() => {
    onSlots?.({ panel, count });
  }, [onSlots, panel, count]);
  useEffect(() => () => onSlots?.({ panel: null, count: undefined }), [onSlots]);
  return children({ list, panel, count });
}
