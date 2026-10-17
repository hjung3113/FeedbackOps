import { ApiError } from '@/lib/api/types';
import type { VocClusterSuggestionsResponse } from '@fops/shared';
import type { QueryClient } from '@tanstack/react-query';

/** Mutation-owned cleanup must finish even after its review session exits. */
export async function evictDeniedClusterSuggestion(
  client: QueryClient,
  error: unknown,
  intent: { id: string; actorContext?: string | undefined },
) {
  if (!(error instanceof ApiError) || ![403, 404].includes(error.status)) return;
  const filters = {
    queryKey: ['voc-cluster-suggestions', { actorContext: intent.actorContext }],
  };
  await client.cancelQueries(filters);
  client.setQueriesData<VocClusterSuggestionsResponse>(filters, (data) =>
    data?.available ? { ...data, items: data.items.filter((item) => item.id !== intent.id) } : data,
  );
  // Keep safe local error handling independent of a delayed corrective GET.
  void client.invalidateQueries(filters);
}
