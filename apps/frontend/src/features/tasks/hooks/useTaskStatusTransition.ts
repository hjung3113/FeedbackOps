import { mapUnknownError } from '@/lib/api/errorMapper';
import { updateTaskStatus } from '@/lib/api/tasks';
import { ApiError } from '@/lib/api/types';
import { invalidateRecovery } from '@/lib/query/recovery';
import type { ListTasksResponse, TaskDto, TaskStatus } from '@fops/shared';
import {
  type InfiniteData,
  type QueryClient,
  type QueryKey,
  hashKey,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import * as React from 'react';
import { toast } from 'sonner';
import { TASK_BOARD_STATUS_COLUMNS } from './useTaskBoardData';

function uuid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

type ColumnPages = InfiniteData<ListTasksResponse, string | undefined>;
type Position = { page: number; index: number };

/** Where the board's caches live right now; read at each invocation, never retained. */
export type TaskBoardCaches =
  | {
      mode: 'status';
      includesFallback: (task: TaskDto) => boolean;
      columnKey: (status: TaskStatus) => QueryKey;
      /** Loads a column's first page when no cache exists so the moved card can render there. */
      ensureColumn: (status: TaskStatus) => Promise<unknown>;
    }
  | { mode: 'open'; openKey: QueryKey };

// One invocation's own delta. Rollback undoes exactly this, never a whole-column snapshot.
type Delta = {
  taskId: string;
  token: number;
  previous: TaskDto;
  target: TaskStatus;
  sourceKey: QueryKey | null;
  targetKey: QueryKey | null;
  sourceRemovedAt: Position | null;
  sourceTotalAdjusted: boolean;
  targetInserted: boolean;
  targetTotalAdjusted: boolean;
  openKey: QueryKey | null;
  openPrevious: { item: TaskDto; index: number } | null;
};

const CLOSED: readonly TaskStatus[] = ['done', 'released'];

function stripDetail(task: TaskDto): TaskDto {
  const { source: _source, ...rest } = task as TaskDto & { source?: unknown };
  return rest;
}

function findPosition(data: ColumnPages | undefined, taskId: string): Position | null {
  if (!data) return null;
  for (const [page, response] of data.pages.entries()) {
    const index = response.items.findIndex((item) => item.id === taskId);
    if (index >= 0) return { page, index };
  }
  return null;
}

function withoutTask(data: ColumnPages, taskId: string): ColumnPages {
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.filter((item) => item.id !== taskId),
    })),
  };
}

function withTotal(data: ColumnPages, delta: number): ColumnPages {
  const [first, ...rest] = data.pages;
  const total = first?.page?.total;
  if (!first || !first.page || total === undefined) return data;
  return {
    ...data,
    pages: [{ ...first, page: { ...first.page, total: Math.max(0, total + delta) } }, ...rest],
  };
}

function hasTotal(data: ColumnPages | undefined): boolean {
  return data?.pages[0]?.page?.total !== undefined;
}

function withTaskAt(data: ColumnPages, task: TaskDto, at: Position | null): ColumnPages {
  const cleaned = withoutTask(data, task.id);
  const pageIndex = Math.min(at?.page ?? 0, cleaned.pages.length - 1);
  return {
    ...cleaned,
    pages: cleaned.pages.map((page, index) => {
      if (index !== pageIndex) return page;
      const items = [...page.items];
      items.splice(Math.min(at?.index ?? 0, items.length), 0, task);
      return { ...page, items };
    }),
  };
}

function locate(
  client: QueryClient,
  caches: Extract<TaskBoardCaches, { mode: 'status' }>,
  task: TaskDto,
): TaskStatus {
  // A queued second move can carry a stale Task object; trust the loaded cache first.
  for (const status of TASK_BOARD_STATUS_COLUMNS) {
    const data = client.getQueryData<ColumnPages>(caches.columnKey(status));
    if (findPosition(data, task.id)) return status;
  }
  return task.status;
}

export function useTaskStatusTransition(caches: TaskBoardCaches, scopeKey = '') {
  const client = useQueryClient();
  const mutationTokens = React.useRef(new Map<string, number>());
  const pendingDeltas = React.useRef(new Set<Delta>());
  const deferredRefetch = React.useRef(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = React.useRef(false);
  const reads = React.useRef(0);
  const [isReconciling, setIsReconciling] = React.useState(false);

  const flush = React.useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    deferredRefetch.current = false;
    reads.current += 1;
    if (mounted.current) setIsReconciling(true);
    void client.invalidateQueries({ queryKey: ['tasks'] }).finally(() => {
      reads.current -= 1;
      if (mounted.current && reads.current === 0 && !deferredRefetch.current) {
        setIsReconciling(false);
      }
    });
  }, [client]);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (deferredRefetch.current) flush();
    };
  }, [flush]);

  const previousScope = React.useRef(scopeKey);
  React.useEffect(() => {
    if (previousScope.current !== scopeKey && deferredRefetch.current) flush();
    previousScope.current = scopeKey;
  }, [scopeKey, flush]);

  React.useEffect(
    () =>
      client.getQueryCache().subscribe((event) => {
        if (event.type !== 'updated' || event.action.type !== 'success' || event.action.manual)
          return;
        // A deadline read may finish with moves still outstanding. Rebase each invocation's
        // delta on fresh server pages, so its later rollback undoes only the reapplied change.
        const key = event.query.queryHash;
        for (const delta of pendingDeltas.current) {
          if (mutationTokens.current.get(delta.taskId) !== delta.token) continue;
          if (delta.sourceKey && hashKey(delta.sourceKey) === key) {
            client.setQueryData<ColumnPages>(delta.sourceKey, (old) => {
              if (!old) return old;
              const position = findPosition(old, delta.taskId);
              const item = position ? old.pages[position.page]?.items[position.index] : undefined;
              if (item) delta.previous = item;
              delta.sourceRemovedAt = position;
              delta.sourceTotalAdjusted = hasTotal(old);
              return withTotal(withoutTask(old, delta.taskId), -1);
            });
          }
          if (delta.targetKey && hashKey(delta.targetKey) === key) {
            client.setQueryData<ColumnPages>(delta.targetKey, (old) => {
              if (!old) return old;
              const alreadyHere = findPosition(old, delta.taskId) !== null;
              delta.targetInserted = !alreadyHere;
              delta.targetTotalAdjusted = !alreadyHere && hasTotal(old);
              const next = withTaskAt(old, { ...delta.previous, status: delta.target }, null);
              return delta.targetTotalAdjusted ? withTotal(next, 1) : next;
            });
          }
          if (delta.openKey && hashKey(delta.openKey) === key) {
            client.setQueryData<ListTasksResponse>(delta.openKey, (old) => {
              if (!old) return old;
              const index = old.items.findIndex((item) => item.id === delta.taskId);
              const item = old.items[index];
              delta.openPrevious = item ? { item, index } : null;
              return {
                ...old,
                items: CLOSED.includes(delta.target)
                  ? old.items.filter((item) => item.id !== delta.taskId)
                  : old.items.map((item) =>
                      item.id === delta.taskId ? { ...item, status: delta.target } : item,
                    ),
              };
            });
          }
        }
      }),
    [client],
  );

  function invalidateLists() {
    // onSettled still counts this invocation. Never extend the oldest settlement's deadline.
    const overlapping = client.isMutating({ mutationKey: ['task-status-transition'] }) > 1;
    if (!overlapping || !mounted.current) {
      flush();
      return;
    }
    deferredRefetch.current = true;
    setIsReconciling(true);
    void client.invalidateQueries({ queryKey: ['tasks'], refetchType: 'none' });
    if (timer.current === null) timer.current = setTimeout(flush, 1_500);
  }

  function rollback(delta: Delta) {
    if (delta.targetKey && delta.targetInserted) {
      client.setQueryData<ColumnPages>(delta.targetKey, (old) => {
        if (!old) return old;
        const pos = findPosition(old, delta.taskId);
        const here = pos ? old.pages[pos.page]?.items[pos.index] : undefined;
        // Only remove the membership this invocation inserted.
        const next = here?.status === delta.target ? withoutTask(old, delta.taskId) : old;
        return delta.targetTotalAdjusted ? withTotal(next, -1) : next;
      });
    } else if (delta.targetKey && delta.targetTotalAdjusted) {
      client.setQueryData<ColumnPages>(delta.targetKey, (old) => old && withTotal(old, -1));
    }
    if (delta.sourceKey) {
      client.setQueryData<ColumnPages>(delta.sourceKey, (old) => {
        if (!old) return old;
        const restored = delta.sourceRemovedAt
          ? withTaskAt(old, delta.previous, delta.sourceRemovedAt)
          : old;
        return delta.sourceTotalAdjusted ? withTotal(restored, 1) : restored;
      });
    }
    if (delta.openKey && delta.openPrevious) {
      const { item, index } = delta.openPrevious;
      client.setQueryData<ListTasksResponse>(delta.openKey, (old) => {
        if (!old) return old;
        const items = old.items.filter((candidate) => candidate.id !== item.id);
        items.splice(Math.min(index, items.length), 0, item);
        return { ...old, items };
      });
    }
  }

  const mutation = useMutation({
    mutationKey: ['task-status-transition'],
    mutationFn: ({ task, status }: { task: TaskDto; status: TaskStatus }) =>
      updateTaskStatus(task.id, status, { ifMatch: task.updated_at, idempotencyKey: uuid() }),
    onMutate: async ({ task, status }): Promise<Delta> => {
      const token = (mutationTokens.current.get(task.id) ?? 0) + 1;
      mutationTokens.current.set(task.id, token);
      const delta: Delta = {
        taskId: task.id,
        token,
        previous: stripDetail(task),
        target: status,
        sourceKey: null,
        targetKey: null,
        sourceRemovedAt: null,
        sourceTotalAdjusted: false,
        targetInserted: false,
        targetTotalAdjusted: false,
        openKey: null,
        openPrevious: null,
      };
      await client.cancelQueries({ queryKey: ['tasks'] });
      if (caches.mode === 'open') {
        const open = client.getQueryData<ListTasksResponse>(caches.openKey);
        const index = open?.items.findIndex((item) => item.id === task.id) ?? -1;
        const item = open?.items[index];
        if (open && item) {
          delta.openKey = caches.openKey;
          delta.openPrevious = { item, index };
          client.setQueryData<ListTasksResponse>(caches.openKey, {
            ...open,
            items: CLOSED.includes(status)
              ? open.items.filter((candidate) => candidate.id !== task.id)
              : open.items.map((candidate) =>
                  candidate.id === task.id ? { ...candidate, status } : candidate,
                ),
          });
        }
        pendingDeltas.current.add(delta);
        return delta;
      }
      const sourceStatus = locate(client, caches, task);
      if (sourceStatus === status) return delta;
      const sourceKey = caches.columnKey(sourceStatus);
      const sourceBeforeLoad = client.getQueryData<ColumnPages>(sourceKey);
      if (!findPosition(sourceBeforeLoad, task.id) && !caches.includesFallback(task)) return delta;
      // A destination without data cannot render the moved card: load it before writing.
      const targetKey = caches.columnKey(status);
      if (!client.getQueryData(targetKey)) await caches.ensureColumn(status);
      const source = client.getQueryData<ColumnPages>(sourceKey);
      const position = findPosition(source, task.id);
      const current = position ? source?.pages[position.page]?.items[position.index] : undefined;
      delta.previous = stripDetail(current ?? task);
      if (source) {
        delta.sourceKey = sourceKey;
        delta.sourceRemovedAt = position;
        delta.sourceTotalAdjusted = hasTotal(source);
        client.setQueryData<ColumnPages>(sourceKey, withTotal(withoutTask(source, task.id), -1));
      }
      const target = client.getQueryData<ColumnPages>(targetKey);
      if (target) {
        delta.targetKey = targetKey;
        delta.targetInserted = true;
        delta.targetTotalAdjusted = hasTotal(target);
        client.setQueryData<ColumnPages>(
          targetKey,
          withTotal(withTaskAt(target, { ...delta.previous, status }, null), 1),
        );
      }
      pendingDeltas.current.add(delta);
      return delta;
    },
    onError: (error, _variables, context) => {
      if (context) pendingDeltas.current.delete(context);
      const latest = context && mutationTokens.current.get(context.taskId) === context.token;
      if (context && latest) rollback(context);
      if (error instanceof ApiError && error.code === 'conflict.stale_write' && latest) {
        invalidateLists();
      }
      toast.error(mapUnknownError(error).message);
    },
    onSuccess: (_data, _variables, context) => {
      if (context) pendingDeltas.current.delete(context);
      void invalidateRecovery(client);
    },
    onSettled: (_data, _error, _variables, context) => {
      // A superseded last invocation may flush a refetch queued by a valid earlier settlement.
      const latest = !context || mutationTokens.current.get(context.taskId) === context.token;
      if (
        !latest &&
        deferredRefetch.current &&
        client.isMutating({ mutationKey: ['task-status-transition'] }) === 1
      ) {
        invalidateLists();
      }
      if (latest) {
        invalidateLists();
        if (context) void client.invalidateQueries({ queryKey: ['task', context.taskId] });
      }
    },
  });
  return { ...mutation, isReconciling };
}
