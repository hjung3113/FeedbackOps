import { apiClient } from '@/lib/api';
import type {
  EntityLinkDto,
  EntityLinkRelationType,
  EntityLinkStatus,
  EntityLinkStatusCounts,
} from '@fops/shared';
import { useInfiniteQuery } from '@tanstack/react-query';

const PAGE_SIZE = 50;

export interface EntityLinkInventoryParams {
  status?: EntityLinkStatus;
  relationType?: EntityLinkRelationType;
  managedSystemId?: string;
}

export interface EntityLinkInventoryPage {
  items: EntityLinkDto[];
  page?: { has_more: boolean; cursor?: string; status_counts?: EntityLinkStatusCounts };
}

export function entityLinkInventoryQueryKey(params: EntityLinkInventoryParams) {
  const { status, relationType, managedSystemId } = params;
  return ['entity-links', 'inventory', status, relationType, managedSystemId] as const;
}

export function useEntityLinkInventory(params: EntityLinkInventoryParams, enabled = true) {
  const { status, relationType, managedSystemId } = params;

  return useInfiniteQuery({
    queryKey: entityLinkInventoryQueryKey(params),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ signal, pageParam }): Promise<EntityLinkInventoryPage> => {
      const qs = new URLSearchParams();
      qs.set('scope', 'workspace');
      qs.set('limit', String(PAGE_SIZE));
      if (pageParam !== undefined) qs.set('cursor', pageParam);
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
    getNextPageParam: (lastPage) =>
      lastPage.page?.has_more === true ? lastPage.page.cursor : undefined,
    staleTime: 30_000,
    retry: 1,
    enabled,
  });
}
