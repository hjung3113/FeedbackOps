import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/api';
import type { CreateFindingRequest, FindingDto } from '@fops/shared';

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
  return useMutation<FindingDto, ApiError, CreateFindingFromVocMutationVariables>({
    mutationFn: async ({ vocId, body }) => {
      const res = await apiClient<FindingDto>('POST', `/vocs/${vocId}/create-finding`, {
        body,
        idempotencyKey,
      });
      return res.data;
    },
    ...(onSuccess ? { onSuccess } : {}),
    ...(onError ? { onError } : {}),
  });
}
