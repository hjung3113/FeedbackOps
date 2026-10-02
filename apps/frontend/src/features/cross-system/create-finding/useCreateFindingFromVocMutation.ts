import { type ApiError, apiClient } from '@/lib/api';
import { invalidateNavCounts } from '@/lib/query/navCounts';
import type { CreateFindingRequest, FindingDto } from '@fops/shared';
import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';

export interface UseCreateFindingFromVocMutationArgs {
  idempotencyKey: string;
  onSuccess?: (data: FindingDto) => void;
  onError?: (err: ApiError) => void;
}

export type CreateFindingFromVocMutationVariables = {
  vocId: string;
  body: CreateFindingRequest;
};

export type CreateFindingFromVocMutationResult = UseMutationResult<
  FindingDto,
  ApiError,
  CreateFindingFromVocMutationVariables
>;

export function useCreateFindingFromVocMutation(
  args: UseCreateFindingFromVocMutationArgs,
): CreateFindingFromVocMutationResult {
  const { idempotencyKey, onSuccess, onError } = args;
  const queryClient = useQueryClient();
  return useMutation<FindingDto, ApiError, CreateFindingFromVocMutationVariables>({
    mutationFn: async ({ vocId, body }) => {
      const res = await apiClient<FindingDto>('POST', `/vocs/${vocId}/create-finding`, {
        body,
        idempotencyKey,
      });
      return res.data;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['findings'] });
      invalidateNavCounts(queryClient);
      onSuccess?.(data);
    },
    ...(onError ? { onError } : {}),
  });
}
