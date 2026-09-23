import type { ListActorsResponse } from '@fops/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import {
  type AnalyticsAreaDto,
  type ManagedSystemDto,
  type ResolveActorsResponse,
  apiClient,
  fetchAnalyticsAreas,
  fetchManagedSystems,
  fetchPermissionRequestsAll,
  resolveActors,
} from '../../../lib/api';
import { groupAreasByMs } from '../lib/groupAreasByMs.js';

// Shared by string with other screens' ['managed-systems', …] queries; the
// prefix invalidate below also refreshes them. Do not rename or narrow.
export const managedSystemsQueryKey = ['managed-systems'] as const;

export function useManagedSystemsRegistry(includeArchived: boolean): {
  systems: ManagedSystemDto[];
  areasByMs: Map<string, AnalyticsAreaDto[]>;
  renderedAreaCount: number;
  resolved: ResolveActorsResponse | undefined;
  listQuery: { isPending: boolean; isError: boolean; error: unknown };
  requestsCount: number;
  invalidate: () => Promise<void>;
} {
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: [...managedSystemsQueryKey, { includeArchived }] as const,
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived, signal }),
    retry: false,
  });
  const areasQuery = useQuery({
    queryKey: ['analytics-areas', { includeArchived }] as const,
    queryFn: ({ signal }) => fetchAnalyticsAreas({ includeArchived, signal }),
    retry: false,
  });
  const requestsQuery = useQuery({
    queryKey: ['permission-requests', 'all'] as const,
    queryFn: ({ signal }) => fetchPermissionRequestsAll(signal),
    retry: false,
  });

  const systems = useMemo(() => listQuery.data?.items ?? [], [listQuery.data]);
  const areas = useMemo(() => areasQuery.data?.items ?? [], [areasQuery.data]);
  const areasByMs = useMemo(() => groupAreasByMs(areas, includeArchived), [areas, includeArchived]);
  const renderedAreaCount = useMemo(
    () => systems.reduce((count, system) => count + (areasByMs.get(system.id)?.length ?? 0), 0),
    [areasByMs, systems],
  );

  const ownerActorIds = useMemo(
    () => [
      ...new Set(systems.map((m) => m.default_owner_actor_id).filter((v): v is string => !!v)),
    ],
    [systems],
  );
  const ownerTeamIds = useMemo(
    () => [...new Set(systems.map((m) => m.default_owner_team_id).filter((v): v is string => !!v))],
    [systems],
  );
  const resolveQuery = useQuery({
    queryKey: ['actors-resolve', ownerActorIds, ownerTeamIds] as const,
    queryFn: ({ signal }) =>
      resolveActors({ actorIds: ownerActorIds, teamIds: ownerTeamIds }, signal),
    enabled: ownerActorIds.length > 0 || ownerTeamIds.length > 0,
    retry: false,
  });

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: managedSystemsQueryKey });
  }

  return {
    systems,
    areasByMs,
    renderedAreaCount,
    resolved: resolveQuery.data,
    listQuery: {
      isPending: listQuery.isPending,
      isError: listQuery.isError,
      error: listQuery.error,
    },
    requestsCount: requestsQuery.data?.count ?? 0,
    invalidate,
  };
}

export function useRegistryActorOptions(): { id: string; display_name: string }[] | undefined {
  const actorsQuery = useQuery({
    queryKey: ['actors', 'workspace', 'current'] as const,
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await apiClient<ListActorsResponse>('GET', '/actors?workspace=current', {
        signal,
      });
      return response.data.actors.map(({ id, display_name }) => ({ id, display_name }));
    },
  });
  return actorsQuery.data;
}

export function useKnownOwnerTeam(
  knownTeamId: string | undefined,
): { id: string; name: string } | undefined {
  const teamQuery = useQuery({
    queryKey: ['actors-resolve', [], knownTeamId ? [knownTeamId] : []] as const,
    enabled: knownTeamId !== undefined,
    retry: false,
    queryFn: ({ signal }) => resolveActors({ teamIds: knownTeamId ? [knownTeamId] : [] }, signal),
  });
  return teamQuery.data?.teams[0];
}
