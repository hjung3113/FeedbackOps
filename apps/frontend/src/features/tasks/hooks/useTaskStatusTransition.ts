import { mapUnknownError } from '@/lib/api/errorMapper';
import { updateTaskStatus } from '@/lib/api/tasks';
import { ApiError } from '@/lib/api/types';
import type { TaskDto, TaskStatus } from '@fops/shared';
import { type QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { toast } from 'sonner';

function uuid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

export function useTaskStatusTransition(tasksKey: QueryKey) {
  const client = useQueryClient();
  const mutationTokens = React.useRef(new Map<string, number>());

  return useMutation({
    mutationKey: ['task-status-transition'],
    mutationFn: ({ task, status }: { task: TaskDto; status: TaskStatus }) =>
      updateTaskStatus(task.id, status, { ifMatch: task.updated_at, idempotencyKey: uuid() }),
    onMutate: async ({ task, status }) => {
      const token = (mutationTokens.current.get(task.id) ?? 0) + 1;
      mutationTokens.current.set(task.id, token);
      await client.cancelQueries({ queryKey: ['tasks'] });
      const previousStatus =
        client
          .getQueryData<{ items: TaskDto[] }>(tasksKey)
          ?.items.find((item) => item.id === task.id)?.status ?? task.status;
      client.setQueryData<{ items: TaskDto[] }>(tasksKey, (old) =>
        old
          ? {
              ...old,
              items: old.items.map((item) => (item.id === task.id ? { ...item, status } : item)),
            }
          : old,
      );
      return { taskId: task.id, previousStatus, token };
    },
    onError: (error, _variables, context) => {
      if (context && mutationTokens.current.get(context.taskId) === context.token) {
        client.setQueryData<{ items: TaskDto[] }>(tasksKey, (old) =>
          old
            ? {
                ...old,
                items: old.items.map((item) =>
                  item.id === context.taskId ? { ...item, status: context.previousStatus } : item,
                ),
              }
            : old,
        );
      }
      if (
        error instanceof ApiError &&
        error.code === 'conflict.stale_write' &&
        context &&
        mutationTokens.current.get(context.taskId) === context.token
      ) {
        void client.invalidateQueries({ queryKey: ['tasks'] });
        toast.error(mapUnknownError(error).message);
        return;
      }
      toast.error(mapUnknownError(error).message);
    },
    onSettled: (_data, _error, _variables, context) => {
      if (!context || mutationTokens.current.get(context.taskId) === context.token) {
        void client.invalidateQueries({ queryKey: ['tasks'] });
        if (context) void client.invalidateQueries({ queryKey: ['task', context.taskId] });
      }
    },
  });
}
