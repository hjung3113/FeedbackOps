import { type ApiError, apiClient, apiRequest } from '@/lib/api';
import { EVIDENCE_INVENTORY_QUERY_KEY } from '@/lib/query/evidence-inventory-key';
import { invalidateRecovery } from '@/lib/query/recovery';
import {
  type AddEvidenceHighlightRequest,
  type AttachSurveyEvidenceRequest,
  type EvidenceHighlightDto,
  type LinkEvidenceRequest,
  attachSurveyEvidenceRequestSchema,
  attachSurveyEvidenceResponseSchema,
} from '@fops/shared';
import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';

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
      void invalidateRecovery(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['finding', findingId] });
      void queryClient.invalidateQueries({ queryKey: ['findings'] });
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
      void invalidateRecovery(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['finding', findingId] });
      void queryClient.invalidateQueries({ queryKey: ['findings'] });
      void queryClient.invalidateQueries({
        queryKey: ['finding', findingId, 'evidence-highlights'],
      });
      onSuccess?.(data);
    },
    ...(onError ? { onError } : {}),
  });
}

// Metadata-only attachment; the authorized highlight query supplies content.
export function useAttachSurveyEvidenceMutation(findingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      body,
      idempotencyKey,
    }: { body: AttachSurveyEvidenceRequest; idempotencyKey: string }) =>
      (
        await apiRequest(
          'POST',
          `/findings/${findingId}/survey-evidence`,
          attachSurveyEvidenceResponseSchema,
          {
            body: attachSurveyEvidenceRequestSchema.parse(body),
            idempotencyKey,
          },
        )
      ).data,
    onSuccess: async () => {
      void invalidateRecovery(queryClient);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['finding', findingId], refetchType: 'all' }),
        queryClient.invalidateQueries({ queryKey: ['findings'], refetchType: 'all' }),
        queryClient.invalidateQueries({
          queryKey: EVIDENCE_INVENTORY_QUERY_KEY,
          refetchType: 'all',
        }),
      ]);
    },
  });
}
