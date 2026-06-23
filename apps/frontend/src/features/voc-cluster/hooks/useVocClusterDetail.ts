// useVocClusterDetail — react-query wrapper for GET /voc-clusters/:id.
// Returns the full VocClusterDto including the members array.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type { VocClusterDto } from '@fops/shared';

export function useVocClusterDetail(
  id: string | null | undefined,
): UseQueryResult<VocClusterDto> {
  return useQuery({
    queryKey: ['voc-cluster', id] as const,
    queryFn: async ({ signal }) => {
      const res = await apiClient<VocClusterDto>('GET', `/voc-clusters/${id as string}`, { signal });
      return res.data;
    },
    enabled: Boolean(id),
    staleTime: 30_000,
    retry: 1,
  });
}
