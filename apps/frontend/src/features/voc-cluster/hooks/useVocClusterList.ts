// useVocClusterList — react-query wrapper for GET /voc-clusters.
// Optional managed_system_id filter mirrors the backend query param.

import { apiRequest } from '@/lib/api';
import { listVocClustersResponseSchema } from '@fops/shared';
import type { ListVocClustersResponse } from '@fops/shared';
import { type UseQueryResult, useQuery } from '@tanstack/react-query';

export function useVocClusterList(
  managedSystemId?: string,
): UseQueryResult<ListVocClustersResponse> {
  return useQuery({
    queryKey: ['voc-clusters', { managedSystemId }] as const,
    queryFn: async ({ signal }) => {
      const path = managedSystemId
        ? `/voc-clusters?managed_system_id=${encodeURIComponent(managedSystemId)}`
        : '/voc-clusters';
      const res = await apiRequest('GET', path, listVocClustersResponseSchema, { signal });
      return res.data;
    },
    staleTime: 30_000,
    retry: 1,
  });
}
