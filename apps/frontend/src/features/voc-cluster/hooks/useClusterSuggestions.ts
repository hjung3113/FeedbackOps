import type { MeResponse } from '@/lib/api/auth';
import { apiRequest } from '@/lib/api/client';
import { ApiError } from '@/lib/api/types';
import { vocClusterSuggestionsResponseSchema } from '@fops/shared';
import { useQuery } from '@tanstack/react-query';

export function clusterSuggestionActorContext(me: MeResponse | undefined) {
  return me?.actor ? `${me.workspace_id}:${me.actor.id}:${me.actor.role_level}` : undefined;
}

export function clusterSuggestionsKey(managedSystemId?: string, actorContext?: string) {
  return ['voc-cluster-suggestions', { managedSystemId, actorContext }] as const;
}

export function useClusterSuggestions(
  managedSystemId?: string,
  actorContext?: string,
  enabled = true,
) {
  return useQuery({
    queryKey: clusterSuggestionsKey(managedSystemId, actorContext),
    queryFn: async ({ signal }) => {
      const path = managedSystemId
        ? `/voc-cluster-suggestions?managed_system_id=${encodeURIComponent(managedSystemId)}`
        : '/voc-cluster-suggestions';
      return (await apiRequest('GET', path, vocClusterSuggestionsResponseSchema, { signal })).data;
    },
    enabled,
    staleTime: 30_000,
    retry: (count, error) => !(error instanceof ApiError) && count < 1,
  });
}
