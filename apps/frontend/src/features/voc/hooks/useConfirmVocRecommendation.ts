// useConfirmVocRecommendation — POST /vocs/:id/recommendations/:candidate_id/confirm (#168 step 6).
//
// 200 { voc_cluster_id, cluster_created }. Confirm creates or joins a Cluster,
// so it mutates state outside this panel: the cluster list, the confirmed
// cluster's detail, and the recommendation list all go stale.
//
// 422 validation.failed with fields[0] = { path: ['candidate_voc_id'],
// code: 'out_of_scope' } means the pair spans two Managed Systems.

import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ConfirmVocRecommendationResponse } from '@fops/shared';

import { type ApiError, apiClient } from '@/lib/api';

import { vocRecommendationsQueryKey } from './useVocRecommendations';

/** True when a 422 names candidate_voc_id as out of scope (cross-Managed-System pair). */
export function isCrossManagedSystemError(err: ApiError): boolean {
  if (err.status !== 422 || err.code !== 'validation.failed') return false;
  const fields = err.detail?.['fields'];
  if (!Array.isArray(fields)) return false;
  return fields.some((field) => {
    if (typeof field !== 'object' || field === null) return false;
    const { code, path } = field as { code?: unknown; path?: unknown };
    return code === 'out_of_scope' && Array.isArray(path) && path.includes('candidate_voc_id');
  });
}

export function useConfirmVocRecommendation(
  vocId: string,
): UseMutationResult<ConfirmVocRecommendationResponse, ApiError, string> {
  const qc = useQueryClient();
  return useMutation<ConfirmVocRecommendationResponse, ApiError, string>({
    mutationFn: async (candidateVocId) => {
      const res = await apiClient<ConfirmVocRecommendationResponse>(
        'POST',
        `/vocs/${vocId}/recommendations/${candidateVocId}/confirm`,
      );
      return res.data;
    },
    onSuccess: async (data) => {
      await qc.invalidateQueries({ queryKey: vocRecommendationsQueryKey(vocId) });
      await qc.invalidateQueries({ queryKey: ['voc-clusters'] });
      await qc.invalidateQueries({ queryKey: ['voc-cluster', data.voc_cluster_id] });
      await qc.invalidateQueries({ queryKey: ['voc', vocId] });
    },
    onError: async (err) => {
      if (err.status === 404) {
        await qc.invalidateQueries({ queryKey: vocRecommendationsQueryKey(vocId) });
      }
    },
  });
}
