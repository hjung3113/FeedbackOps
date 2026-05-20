import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type { VocDetailEnvelope, VocSummaryEnvelope } from '@fops/shared';

export type VocDetailResult = VocDetailEnvelope | VocSummaryEnvelope;

export function useVocDetail(
  id: string | null | undefined,
): UseQueryResult<VocDetailResult> {
  return useQuery({
    queryKey: ['voc', id] as const,
    queryFn: async ({ signal }) => {
      // TODO(#21): ETag round-trip — cache last seen ETag per id in queryClient
      // metadata and pass ifNoneMatch; handle 304 by returning cached data.
      // Skipped for #20 per plan; contract is in place.
      const res = await apiClient<VocDetailResult>('GET', `/vocs/${id as string}`, { signal });
      return res.data;
    },
    enabled: Boolean(id),
    staleTime: 30_000,
    retry: 1,
  });
}
