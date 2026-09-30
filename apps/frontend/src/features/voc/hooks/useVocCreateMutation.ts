import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/api';
import type { CreateVocRequest } from '@fops/shared';
import { invalidateNavCounts } from '@/lib/query/navCounts';

// POST /vocs success shape — backend returns the created row's id + minimal
// envelope. Slice 3 #13 BE returns at least { id, display_id, created_at };
// `id` navigates to the inbox row and `display_id` appears in the success receipt.
export interface VocCreateSuccess {
  id: string;
  display_id: string;
  created_at?: string;
}

export interface UseVocCreateMutationArgs {
  idempotencyKey: string;
  onSuccess?: (data: VocCreateSuccess) => void;
  onError?: (err: ApiError) => void;
}

export type VocCreateMutationResult = UseMutationResult<VocCreateSuccess, ApiError, CreateVocRequest>;

export function useVocCreateMutation(args: UseVocCreateMutationArgs): VocCreateMutationResult {
  const { idempotencyKey, onSuccess, onError } = args;
  const queryClient = useQueryClient();
  return useMutation<VocCreateSuccess, ApiError, CreateVocRequest>({
    mutationFn: async (body) => {
      const res = await apiClient<VocCreateSuccess>('POST', '/vocs', {
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
