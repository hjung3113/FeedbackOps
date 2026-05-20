import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/api';
import type { CreateVocRequest } from '@fops/shared';

// POST /vocs success shape — backend returns the created row's id + minimal
// envelope. Slice 3 #13 BE returns at least { id, display_id, created_at };
// only `id` is consumed by the FE here (used to navigate to the inbox row).
export interface VocCreateSuccess {
  id: string;
  display_id?: string;
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
  return useMutation<VocCreateSuccess, ApiError, CreateVocRequest>({
    mutationFn: async (body) => {
      const res = await apiClient<VocCreateSuccess>('POST', '/vocs', {
        body,
        idempotencyKey,
      });
      return res.data;
    },
    ...(onSuccess ? { onSuccess } : {}),
    ...(onError ? { onError } : {}),
  });
}
