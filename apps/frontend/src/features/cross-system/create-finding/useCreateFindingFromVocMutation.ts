import { type ApiError, apiClient } from '@/lib/api';
import type { CreateFindingRequest, FindingDto } from '@fops/shared';
import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateNavCounts } from '@/lib/query/navCounts';

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
      invalidateNavCounts(queryClient);
      onSuccess?.(data);
    },
    ...(onError ? { onError } : {}),
  });
}
