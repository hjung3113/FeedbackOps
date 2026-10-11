import { ApiError, apiClient } from '@/lib/api';
import { invalidateNavCounts } from '@/lib/query/navCounts';
import type { FindingDto, PatchFindingRequest } from '@fops/shared';
import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';

export interface UseFindingStatusMutationArgs {
  findingId: string;
  idempotencyKey: string;
  onSuccess?: (data: FindingDto) => void;
  onError?: (err: ApiError) => void;
}

export function useFindingStatusMutation(
  args: UseFindingStatusMutationArgs,
): UseMutationResult<FindingDto, ApiError, PatchFindingRequest> {
  const { findingId, idempotencyKey, onSuccess, onError } = args;
  const queryClient = useQueryClient();

  return useMutation<FindingDto, ApiError, PatchFindingRequest>({
    mutationFn: async (body) => {
      const res = await apiClient<FindingDto>('PATCH', `/findings/${findingId}`, {
        body,
        idempotencyKey,
      });
      return res.data;
    },
    onSuccess: (data) => {
      invalidateNavCounts(queryClient);
      queryClient.setQueryData(['finding', findingId], data);
      void queryClient.invalidateQueries({ queryKey: ['finding', findingId] });
      void queryClient.invalidateQueries({ queryKey: ['findings'] });
      onSuccess?.(data);
    },
    ...(onError ? { onError } : {}),
  });
}
