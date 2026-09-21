// useVocClusterList — react-query wrapper for GET /voc-clusters.
// Optional managed_system_id filter mirrors the backend query param.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api';
import { listVocClustersResponseSchema } from '@fops/shared';
import type { ListVocClustersResponse } from '@fops/shared';

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
