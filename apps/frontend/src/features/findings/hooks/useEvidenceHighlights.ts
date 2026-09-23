import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type { EvidenceHighlightDto, ListEvidenceHighlightsResponse } from '@fops/shared';

export function useEvidenceHighlights(
  findingId: string | null | undefined,
): UseQueryResult<EvidenceHighlightDto[]> {
  return useQuery({
    queryKey: ['finding', findingId, 'evidence-highlights'] as const,
    queryFn: async ({ signal }) => {
      const res = await apiClient<ListEvidenceHighlightsResponse>(
        'GET',
        `/findings/${findingId as string}/evidence-highlights`,
        { signal },
      );
      return res.data.items;
    },
    enabled: Boolean(findingId),
    staleTime: 30_000,
    retry: 1,
  });
}
