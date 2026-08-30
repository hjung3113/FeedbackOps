import { fetchPermissionCheck, linkExistingTask, listTasks } from '@/lib/api';
import type { ApiError } from '@/lib/api/types';
import type { TaskDto, TaskRequestDto } from '@fops/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { toast } from 'sonner';

import { canLinkExistingTaskRequest } from './predicates';

export interface UseTaskRequestLinkArgs {
  item: TaskRequestDto;
  currentRole: string | null;
}

export interface UseTaskRequestLinkResult {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isTasksLoading: boolean;
  inScopeTasks: TaskDto[] | undefined;
  isPending: boolean;
  canLinkExisting: boolean;
  link: (taskId: string) => void;
}

export function useTaskRequestLink({
  item,
  currentRole,
}: UseTaskRequestLinkArgs): UseTaskRequestLinkResult {
  const queryClient = useQueryClient();
  const [linkOpen, setLinkOpen] = React.useState(false);
  const lastItemRef = React.useRef(item);

  React.useEffect(() => {
    if (lastItemRef.current === item) return;
    lastItemRef.current = item;
    setLinkOpen(false);
  });

  const manageCheck = useQuery({
    queryKey: ['permission-check', 'finding.manage', item.primary_managed_system_id],
    queryFn: ({ signal }) =>
      fetchPermissionCheck('finding.manage', {
        managedSystemId: item.primary_managed_system_id,
        signal,
      }),
    enabled: currentRole !== 'admin',
    staleTime: 60 * 1000,
  });
  const canManage = currentRole === 'admin' || manageCheck.data?.state === 'approved';

  const tasksQuery = useQuery({
    queryKey: ['tasks', 'backlog-picker'] as const,
    queryFn: ({ signal }) => listTasks({ signal }),
    enabled: linkOpen,
    staleTime: 30 * 1000,
  });
  const inScopeTasks = React.useMemo(
    () =>
      tasksQuery.data?.items.filter(
        (task) => task.primary_managed_system_id === item.primary_managed_system_id,
      ),
    [tasksQuery.data?.items, item.primary_managed_system_id],
  );

  const linkMutation = useMutation<TaskDto, ApiError, string>({
    mutationFn: async (taskId) => {
      return linkExistingTask(item.id, { task_id: taskId }, crypto.randomUUID());
    },
    onSuccess: (task) => {
      void queryClient.invalidateQueries({ queryKey: ['task-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast(`Linked Task ${task.display_id}.`);
      setLinkOpen(false);
    },
    onError: (err) => {
      toast.error(err.envelope.message);
    },
  });

  return {
    open: linkOpen,
    setOpen: setLinkOpen,
    isTasksLoading: tasksQuery.isLoading,
    inScopeTasks,
    isPending: linkMutation.isPending,
    canLinkExisting: canLinkExistingTaskRequest(item.status) && canManage,
    link: (taskId) => {
      if (!linkMutation.isPending) linkMutation.mutate(taskId);
    },
  };
}
