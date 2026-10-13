import { apiRequest } from '@/lib/api';
import { type EvidenceHighlightDto, listEvidenceHighlightsResponseSchema } from '@fops/shared';
import { type UseQueryResult, useQuery } from '@tanstack/react-query';

export function useEvidenceHighlights(
  findingId: string | null | undefined,
): UseQueryResult<EvidenceHighlightDto[]> {
  return useQuery({
    queryKey: ['finding', findingId, 'evidence-highlights'] as const,
    queryFn: async ({ signal }) => {
      const res = await apiRequest(
        'GET',
        `/findings/${findingId as string}/evidence-highlights`,
        listEvidenceHighlightsResponseSchema,
        { signal },
      );
      return res.data.items;
    },
    enabled: Boolean(findingId),
    staleTime: 30_000,
    retry: 1,
  });
}
