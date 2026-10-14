import { apiRequest } from '@/lib/api/client';
import { invalidateNavCounts } from '@/lib/query/navCounts';
import { invalidateRecovery } from '@/lib/query/recovery';
import {
  type ConfirmVocClusterSuggestionRequest,
  confirmVocClusterSuggestionResponseSchema,
} from '@fops/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function useConfirmClusterSuggestion() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (intent: {
      id: string;
      body: ConfirmVocClusterSuggestionRequest;
      idempotencyKey: string;
    }) =>
      (
        await apiRequest(
          'POST',
          `/voc-cluster-suggestions/${intent.id}/confirm`,
          confirmVocClusterSuggestionResponseSchema,
          {
            body: intent.body,
            idempotencyKey: intent.idempotencyKey,
          },
        )
      ).data,
    onSuccess: async () => {
      invalidateNavCounts(client);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['voc-clusters'] }),
        invalidateRecovery(client),
        client.invalidateQueries({ queryKey: ['voc-cluster-suggestions'] }),
      ]);
    },
  });
}
