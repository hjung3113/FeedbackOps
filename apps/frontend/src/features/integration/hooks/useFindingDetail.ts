import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api';
import { findingDtoSchema } from '@fops/shared';
import type { FindingDto } from '@fops/shared';

export function useFindingDetail(
  id: string | null | undefined,
): UseQueryResult<FindingDto> {
  return useQuery({
    queryKey: ['finding', id] as const,
    queryFn: async ({ signal }) => {
      const res = await apiRequest<FindingDto>(
        'GET',
        `/findings/${id as string}`,
        findingDtoSchema,
        { signal },
      );
      return res.data;
    },
    enabled: Boolean(id),
    staleTime: 30_000,
    retry: 1,
  });
}
