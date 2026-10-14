import { apiRequest } from '@/lib/api/client';
import {
  type RestoreVocClusterSuggestionRequest,
  restoreVocClusterSuggestionResponseSchema,
} from '@fops/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function useRestoreClusterSuggestion() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (intent: {
      id: string;
      body: RestoreVocClusterSuggestionRequest;
      idempotencyKey: string;
    }) =>
      (
        await apiRequest(
          'POST',
          `/voc-cluster-suggestions/${intent.id}/restore`,
          restoreVocClusterSuggestionResponseSchema,
          {
            body: intent.body,
            idempotencyKey: intent.idempotencyKey,
          },
        )
      ).data,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['voc-cluster-suggestions'] });
    },
  });
}
