import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type { FindingDto } from '@fops/shared';

export function useFindingDetail(
  id: string | null | undefined,
): UseQueryResult<FindingDto> {
  return useQuery({
    queryKey: ['finding', id] as const,
    queryFn: async ({ signal }) => {
      const res = await apiClient<FindingDto>('GET', `/findings/${id as string}`, { signal });
      return res.data;
    },
    enabled: Boolean(id),
    staleTime: 30_000,
    retry: 1,
  });
}
