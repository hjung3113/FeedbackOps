import { apiRequest } from '@/lib/api/client';
import {
  type RestoreVocClusterSuggestionRequest,
  restoreVocClusterSuggestionResponseSchema,
} from '@fops/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { evictDeniedClusterSuggestion } from './evictDeniedClusterSuggestion';

export function useRestoreClusterSuggestion() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (intent: {
      id: string;
      actorContext?: string | undefined;
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
    onError: (error, intent) => evictDeniedClusterSuggestion(client, error, intent),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['voc-cluster-suggestions'] });
    },
  });
}
