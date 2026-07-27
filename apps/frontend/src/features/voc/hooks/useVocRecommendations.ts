// useVocRecommendations — GET /vocs/:id/recommendations (#168 step 6).
//
// The response is a discriminated union on `available` (see
// packages/shared/src/vocs/recommendations.ts). The hook returns it verbatim;
// deciding what each state means for the user is the component's job.
//
// Query key: ['voc-recommendations', vocId] — dismiss/confirm invalidate it.

import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import type { VocRecommendationsResponse } from '@fops/shared';

import { apiClient } from '@/lib/api';

export function vocRecommendationsQueryKey(vocId: string | null | undefined) {
  return ['voc-recommendations', vocId] as const;
}

export function useVocRecommendations(
  vocId: string | null | undefined,
): UseQueryResult<VocRecommendationsResponse> {
  return useQuery({
    queryKey: vocRecommendationsQueryKey(vocId),
    queryFn: async ({ signal }) => {
      const res = await apiClient<VocRecommendationsResponse>(
        'GET',
        `/vocs/${vocId as string}/recommendations`,
        { signal },
      );
      return res.data;
    },
    enabled: Boolean(vocId),
    staleTime: 30_000,
    retry: 1,
  });
}
