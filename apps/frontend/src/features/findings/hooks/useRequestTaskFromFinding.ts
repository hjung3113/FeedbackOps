import { type ApiError, apiClient } from '@/lib/api';
import { invalidateNavCounts } from '@/lib/query/navCounts';
import type { CreateTaskRequestFromFindingRequest, TaskRequestDto } from '@fops/shared';
import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';

export interface UseRequestTaskFromFindingArgs {
  findingId: string;
  idempotencyKey: string;
  onSuccess?: (data: TaskRequestDto) => void;
  onError?: (err: ApiError) => void;
}

export function useRequestTaskFromFinding(
  args: UseRequestTaskFromFindingArgs,
): UseMutationResult<TaskRequestDto, ApiError, CreateTaskRequestFromFindingRequest> {
  const { findingId, idempotencyKey, onSuccess, onError } = args;
  const queryClient = useQueryClient();

  return useMutation<TaskRequestDto, ApiError, CreateTaskRequestFromFindingRequest>({
    mutationFn: async (body) => {
      const res = await apiClient<TaskRequestDto>('POST', `/findings/${findingId}/request-task`, {
        body,
        idempotencyKey,
      });
      return res.data;
    },
    onSuccess: (data) => {
      invalidateNavCounts(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['finding', findingId] });
      void queryClient.invalidateQueries({ queryKey: ['findings'] });
      void queryClient.invalidateQueries({ queryKey: ['entity-links'] });
      onSuccess?.(data);
    },
    ...(onError ? { onError } : {}),
  });
}
