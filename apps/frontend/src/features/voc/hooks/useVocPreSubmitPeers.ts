import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import type { VocPreSubmitPeersResponse } from '@fops/shared';

import { apiClient } from '@/lib/api';

export function vocPreSubmitPeersQueryKey(managedSystemId: string | null | undefined) {
  return ['voc-pre-submit-peers', managedSystemId] as const;
}

export function useVocPreSubmitPeers(
  managedSystemId: string | null | undefined,
): UseQueryResult<VocPreSubmitPeersResponse> {
  return useQuery({
    queryKey: vocPreSubmitPeersQueryKey(managedSystemId),
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ managed_system_id: managedSystemId as string });
      const response = await apiClient<VocPreSubmitPeersResponse>(
        'GET',
        `/vocs/pre-submit-peers?${params.toString()}`,
        { signal },
      );
      return response.data;
    },
    enabled: Boolean(managedSystemId),
    staleTime: 30_000,
    retry: 1,
  });
}
