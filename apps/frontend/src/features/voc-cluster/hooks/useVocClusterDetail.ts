// useVocClusterDetail — react-query wrapper for GET /voc-clusters/:id.
// Returns the full VocClusterDto including the members array.

import { ApiParseError, apiRequest } from '@/lib/api';
import { vocClusterDtoSchema } from '@fops/shared';
import type { VocClusterDto } from '@fops/shared';
import { type UseQueryResult, useQuery } from '@tanstack/react-query';

export function useVocClusterDetail(id: string | null | undefined): UseQueryResult<VocClusterDto> {
  return useQuery({
    queryKey: ['voc-cluster', id] as const,
    queryFn: async ({ signal }) => {
      const res = await apiRequest<VocClusterDto>(
        'GET',
        `/voc-clusters/${id as string}`,
        vocClusterDtoSchema,
        { signal },
      );
      return res.data;
    },
    enabled: Boolean(id),
    staleTime: 30_000,
    // A parse failure is deterministic: retrying it only delays the error.
    retry: (failureCount, error) => !(error instanceof ApiParseError) && failureCount < 1,
  });
}
