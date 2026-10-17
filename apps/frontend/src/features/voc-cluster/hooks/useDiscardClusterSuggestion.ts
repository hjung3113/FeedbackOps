import { apiRequest } from '@/lib/api/client';
import {
  type DiscardVocClusterSuggestionRequest,
  discardVocClusterSuggestionResponseSchema,
} from '@fops/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { evictDeniedClusterSuggestion } from './evictDeniedClusterSuggestion';

export function useDiscardClusterSuggestion() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (intent: {
      id: string;
      actorContext?: string | undefined;
      body: DiscardVocClusterSuggestionRequest;
      idempotencyKey: string;
    }) =>
      (
        await apiRequest(
          'POST',
          `/voc-cluster-suggestions/${intent.id}/discard`,
          discardVocClusterSuggestionResponseSchema,
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
