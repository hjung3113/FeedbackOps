// useDismissVocRecommendation — POST /vocs/:id/recommendations/:candidate_id/dismiss (#168 step 6).
//
// 204, empty body. On success the candidate is removed from the cached list
// immediately (so the row disappears without waiting for the refetch) and the
// recommendation query is invalidated so the server list becomes authoritative.

import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';
import type { VocRecommendationsResponse } from '@fops/shared';

import { type ApiError, apiClient } from '@/lib/api';

import { vocRecommendationsQueryKey } from './useVocRecommendations';

export function useDismissVocRecommendation(
  vocId: string,
): UseMutationResult<void, ApiError, string> {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: async (candidateVocId) => {
      await apiClient<void>('POST', `/vocs/${vocId}/recommendations/${candidateVocId}/dismiss`);
    },
    onSuccess: async (_data, candidateVocId) => {
      qc.setQueryData<VocRecommendationsResponse>(vocRecommendationsQueryKey(vocId), (prev) => {
        if (!prev || !prev.available) return prev;
        const items = prev.items.filter((item) => item.voc_id !== candidateVocId);
        const removed = prev.items.length - items.length;
        return { ...prev, items, total: Math.max(0, prev.total - removed) };
      });
      await qc.invalidateQueries({ queryKey: vocRecommendationsQueryKey(vocId) });
    },
    onError: async (err) => {
      // 404 means the candidate stopped being visible between render and click —
      // the cached list is stale, so pull a fresh one. The component owns the copy.
      if (err.status === 404) {
        await qc.invalidateQueries({ queryKey: vocRecommendationsQueryKey(vocId) });
      }
    },
  });
}
