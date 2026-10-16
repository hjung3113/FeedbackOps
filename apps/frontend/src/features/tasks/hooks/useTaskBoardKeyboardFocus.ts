import type { TaskDto, TaskStatus } from '@fops/shared';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import type { TaskBoardGroupBy } from '../components/task-board/TaskBoardGroupByButton';
import { TASK_BOARD_KEY } from './useTaskBoardData';

type FocusScope = {
  q?: string | undefined;
  groupBy: TaskBoardGroupBy;
  managedSystem: string | undefined;
  publicUpdate: 'missing' | undefined;
  /** Serialized personal filters: a filter change retires pending recovery. */
  filters: string;
};

type Pending = {
  taskId: string;
  destinationStatus: TaskStatus | null;
  generation: number;
};

// Mount at route lifetime: loading/error/empty branches may remove the DnD subtree.
export function useTaskBoardKeyboardFocus({
  scope,
  tasks,
  boardScroller,
  isFetching,
  isReconciling = false,
}: {
  scope: FocusScope;
  /** Every Task the board currently has loaded, across all columns. */
  tasks: readonly TaskDto[];
  boardScroller: React.RefObject<HTMLDivElement | null>;
  isFetching: boolean;
  isReconciling?: boolean;
}) {
  const queryClient = useQueryClient();
  const dragGeneration = React.useRef(0);
  const keyboardFocusTask = React.useRef<string | null>(null);
  const [pendingKeyboardFocus, setPendingKeyboardFocus] = React.useState<Pending | null>(null);
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
      previousScope.publicUpdate !== scope.publicUpdate ||
      previousScope.q !== scope.q ||
      previousScope.filters !== scope.filters
    ) {
      dragGeneration.current += 1;
      keyboardFocusTask.current = null;
      setPendingKeyboardFocus(null);
    }
    focusScope.current = scope;
    const pending = pendingKeyboardFocus;
    if (!pending || pending.generation !== dragGeneration.current) return;
    // Every board column and the open set share one key prefix: wait for all of their refetches.
    const refetchSettled =
      !isReconciling && !isFetching && queryClient.isFetching({ queryKey: TASK_BOARD_KEY }) === 0;
    if (
      !tasks.some(
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
  }, [tasks, scope, pendingKeyboardFocus, boardScroller, isFetching, isReconciling, queryClient]);
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
