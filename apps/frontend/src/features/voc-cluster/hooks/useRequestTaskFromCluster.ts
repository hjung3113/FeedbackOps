import { type ApiError, apiClient } from '@/lib/api';
import type { CreateTaskRequestFromVocClusterRequest, TaskRequestDto } from '@fops/shared';
import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';

export interface UseRequestTaskFromClusterArgs {
  clusterId: string;
  idempotencyKey: string;
  onSuccess?: (data: TaskRequestDto) => void;
  onError?: (err: ApiError) => void;
}

export function useRequestTaskFromCluster(
  args: UseRequestTaskFromClusterArgs,
): UseMutationResult<TaskRequestDto, ApiError, CreateTaskRequestFromVocClusterRequest> {
  const { clusterId, idempotencyKey, onSuccess, onError } = args;
  const queryClient = useQueryClient();

  return useMutation<TaskRequestDto, ApiError, CreateTaskRequestFromVocClusterRequest>({
    mutationFn: async (body) => {
      const res = await apiClient<TaskRequestDto>(
        'POST',
        `/voc-clusters/${clusterId}/request-task`,
        {
          body,
          idempotencyKey,
        },
      );
      return res.data;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['voc-cluster', clusterId] });
      void queryClient.invalidateQueries({ queryKey: ['voc-clusters'] });
      void queryClient.invalidateQueries({ queryKey: ['task-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['entity-links'] });
      onSuccess?.(data);
    },
    ...(onError ? { onError } : {}),
  });
}
