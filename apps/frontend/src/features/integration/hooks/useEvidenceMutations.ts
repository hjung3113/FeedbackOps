import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/api';
import type {
  AddEvidenceHighlightRequest,
  EvidenceHighlightDto,
  LinkEvidenceRequest,
} from '@fops/shared';

// ── Add Evidence Highlight ────────────────────────────────────────────────────

export interface UseAddEvidenceHighlightArgs {
  findingId: string;
  idempotencyKey: string;
  onSuccess?: (data: EvidenceHighlightDto) => void;
  onError?: (err: ApiError) => void;
}

export function useAddEvidenceHighlightMutation(
  args: UseAddEvidenceHighlightArgs,
): UseMutationResult<EvidenceHighlightDto, ApiError, AddEvidenceHighlightRequest> {
  const { findingId, idempotencyKey, onSuccess, onError } = args;
  const queryClient = useQueryClient();

  return useMutation<EvidenceHighlightDto, ApiError, AddEvidenceHighlightRequest>({
    mutationFn: async (body) => {
      const res = await apiClient<EvidenceHighlightDto>(
        'POST',
        `/findings/${findingId}/evidence-highlights`,
        { body, idempotencyKey },
      );
      return res.data;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['finding', findingId] });
      void queryClient.invalidateQueries({
        queryKey: ['finding', findingId, 'evidence-highlights'],
      });
      onSuccess?.(data);
    },
    ...(onError ? { onError } : {}),
  });
}

// ── Link Existing Evidence ────────────────────────────────────────────────────

export interface UseLinkEvidenceArgs {
  findingId: string;
  idempotencyKey: string;
  onSuccess?: (data: EvidenceHighlightDto) => void;
  onError?: (err: ApiError) => void;
}

export function useLinkEvidenceMutation(
  args: UseLinkEvidenceArgs,
): UseMutationResult<EvidenceHighlightDto, ApiError, LinkEvidenceRequest> {
  const { findingId, idempotencyKey, onSuccess, onError } = args;
  const queryClient = useQueryClient();

  return useMutation<EvidenceHighlightDto, ApiError, LinkEvidenceRequest>({
    mutationFn: async (body) => {
      const res = await apiClient<EvidenceHighlightDto>(
        'POST',
        `/findings/${findingId}/link-evidence`,
        { body, idempotencyKey },
      );
      return res.data;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['finding', findingId] });
      void queryClient.invalidateQueries({
        queryKey: ['finding', findingId, 'evidence-highlights'],
      });
      onSuccess?.(data);
    },
    ...(onError ? { onError } : {}),
  });
}
