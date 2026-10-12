import type { TaskDto, TaskStatus } from '@fops/shared';
import { type QueryKey, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import type { TaskBoardGroupBy } from '../components/task-board/TaskBoardGroupByButton';

type FocusScope = {
  groupBy: TaskBoardGroupBy;
  managedSystem: string | undefined;
  publicUpdate: 'missing' | undefined;
};

// Mount at route lifetime: loading/error/empty branches may remove the DnD subtree.
export function useTaskBoardKeyboardFocus({
  scope,
  filtered,
  boardScroller,
  isFetching,
  tasksKey,
}: {
  scope: FocusScope;
  filtered: readonly TaskDto[];
  boardScroller: React.RefObject<HTMLDivElement | null>;
  isFetching: boolean;
  tasksKey: QueryKey;
}) {
  const queryClient = useQueryClient();
  const dragGeneration = React.useRef(0);
  const keyboardFocusTask = React.useRef<string | null>(null);
  const [pendingKeyboardFocus, setPendingKeyboardFocus] = React.useState<{
    taskId: string;
    destinationStatus: TaskStatus | null;
    generation: number;
  } | null>(null);
  const focusScope = React.useRef(scope);
  React.useLayoutEffect(
    () => () => {
      dragGeneration.current += 1;
      keyboardFocusTask.current = null;
    },
    [],
  );
  React.useLayoutEffect(() => {
    const previousScope = focusScope.current;
    if (
      previousScope.groupBy !== scope.groupBy ||
      previousScope.managedSystem !== scope.managedSystem ||
      previousScope.publicUpdate !== scope.publicUpdate
    ) {
      dragGeneration.current += 1;
      keyboardFocusTask.current = null;
      setPendingKeyboardFocus(null);
    }
    focusScope.current = scope;
    const pending = pendingKeyboardFocus;
    if (!pending || pending.generation !== dragGeneration.current) return;
    const refetchSettled =
      !isFetching && queryClient.getQueryState(tasksKey)?.fetchStatus !== 'fetching';
    if (
      !filtered.some(
        (task) =>
          task.id === pending.taskId &&
          (pending.destinationStatus === null || task.status === pending.destinationStatus),
      )
    ) {
      if (pending.destinationStatus === null && refetchSettled) setPendingKeyboardFocus(null);
      return;
    }
    const board = boardScroller.current;
    const card =
      board &&
      [...board.querySelectorAll<HTMLButtonElement>('[data-task-board-card-id]')].find(
        (node) => node.dataset.taskBoardCardId === pending.taskId,
      );
    if (!card) {
      if (pending.destinationStatus === null && refetchSettled) setPendingKeyboardFocus(null);
      return;
    }
    // Recovery follows remounts until the invalidation refetch settles; success owns one render.
    if (pending.destinationStatus !== null || refetchSettled) {
      setPendingKeyboardFocus(null);
    }
    // Optimistic cache writes can commit after drag end. Respect focus moved elsewhere meanwhile.
    if (document.activeElement === document.body || board.contains(document.activeElement)) {
      card.focus();
    }
  }, [filtered, scope, pendingKeyboardFocus, boardScroller, isFetching, queryClient, tasksKey]);
  function startDrag() {
    dragGeneration.current += 1;
    setPendingKeyboardFocus(null);
    keyboardFocusTask.current = null;
  }

  function requestMove(taskId: string, destinationStatus: TaskStatus) {
    const generation = dragGeneration.current;
    keyboardFocusTask.current = taskId;
    setPendingKeyboardFocus({ taskId, destinationStatus, generation });
    // Each mutateAsync invocation retains its own generation, even after a newer move.
    return () => {
      if (dragGeneration.current !== generation) return;
      setPendingKeyboardFocus({ taskId, destinationStatus: null, generation });
    };
  }

  function replaceTask(taskId: string) {
    if (keyboardFocusTask.current === taskId) {
      dragGeneration.current += 1;
      keyboardFocusTask.current = null;
      setPendingKeyboardFocus(null);
    }
  }

  function cancelDrag() {
    setPendingKeyboardFocus(null);
  }

  return { startDrag, requestMove, replaceTask, cancelDrag };
}
