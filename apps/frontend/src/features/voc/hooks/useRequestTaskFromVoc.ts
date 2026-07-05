import { type ApiError, apiClient } from '@/lib/api';
import type { CreateTaskRequestFromVocRequest, TaskRequestDto } from '@fops/shared';
import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';

export interface UseRequestTaskFromVocArgs {
  vocId: string;
  idempotencyKey: string;
  onSuccess?: (data: TaskRequestDto) => void;
  onError?: (err: ApiError) => void;
}

export function useRequestTaskFromVoc(
  args: UseRequestTaskFromVocArgs,
): UseMutationResult<TaskRequestDto, ApiError, CreateTaskRequestFromVocRequest> {
  const { vocId, idempotencyKey, onSuccess, onError } = args;
  const queryClient = useQueryClient();

  return useMutation<TaskRequestDto, ApiError, CreateTaskRequestFromVocRequest>({
    mutationFn: async (body) => {
      const res = await apiClient<TaskRequestDto>('POST', `/vocs/${vocId}/request-task`, {
        body,
        idempotencyKey,
      });
      return res.data;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['voc', vocId] });
      void queryClient.invalidateQueries({ queryKey: ['task-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['entity-links'] });
      onSuccess?.(data);
    },
    ...(onError ? { onError } : {}),
  });
}
