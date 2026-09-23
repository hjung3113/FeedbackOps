import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/api';
import type { FindingDto, PatchFindingRequest } from '@fops/shared';

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
      queryClient.setQueryData(['finding', findingId], data);
      void queryClient.invalidateQueries({ queryKey: ['finding', findingId] });
      onSuccess?.(data);
    },
    ...(onError ? { onError } : {}),
  });
}
