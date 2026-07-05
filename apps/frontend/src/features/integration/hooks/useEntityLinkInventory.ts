import { apiClient } from '@/lib/api';
import type { EntityLinkDto, EntityLinkRelationType, EntityLinkStatus } from '@fops/shared';
import { type UseQueryResult, useQuery } from '@tanstack/react-query';

export interface EntityLinkInventoryParams {
  status?: EntityLinkStatus;
  relationType?: EntityLinkRelationType;
  managedSystemId?: string;
}

export interface EntityLinkInventoryPage {
  items: EntityLinkDto[];
}

export function useEntityLinkInventory(
  params: EntityLinkInventoryParams,
): UseQueryResult<EntityLinkInventoryPage> {
  const { status, relationType, managedSystemId } = params;

  return useQuery({
    queryKey: ['entity-links', 'inventory', status, relationType, managedSystemId] as const,
    queryFn: async ({ signal }) => {
      const qs = new URLSearchParams();
      qs.set('scope', 'workspace');
      if (status !== undefined) qs.set('status', status);
      if (relationType !== undefined) qs.set('relation_type', relationType);
      if (managedSystemId !== undefined && managedSystemId !== 'all') {
        qs.set('managed_system_id', managedSystemId);
      }

      const res = await apiClient<EntityLinkInventoryPage>(
        'GET',
        `/entity-links?${qs.toString()}`,
        { signal },
      );
      return res.data;
    },
    staleTime: 30_000,
    retry: 1,
  });
}
