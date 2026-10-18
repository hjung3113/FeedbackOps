import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import {
  type AnalyticsAreaDto,
  type ManagedSystemDto,
  type ResolveActorsResponse,
  fetchEveryAnalyticsAreaPage,
  fetchManagedSystemDefaultCandidates,
  fetchManagedSystemDefaultDiagnostics,
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
  diagnosticsQuery: ReturnType<typeof useDefaultDiagnostics>;
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
    queryFn: ({ signal }) => fetchEveryAnalyticsAreaPage({ includeArchived, signal }),
    retry: false,
  });
  const requestsQuery = useQuery({
    queryKey: ['permission-requests', 'all'] as const,
    queryFn: ({ signal }) => fetchPermissionRequestsAll(signal),
    retry: false,
  });

  const diagnosticsQuery = useDefaultDiagnostics();

  const systems = useMemo(() => listQuery.data?.items ?? [], [listQuery.data]);
  const areas = useMemo(() => areasQuery.data?.items ?? [], [areasQuery.data]);
  const areasByMs = useMemo(() => groupAreasByMs(areas, includeArchived), [areas, includeArchived]);
  const renderedAreaCount = useMemo(
    () => systems.reduce((count, system) => count + (areasByMs.get(system.id)?.length ?? 0), 0),
    [areasByMs, systems],
  );

  const ownerActorIds = useMemo(
    () => [
      ...new Set(
        systems
          .flatMap((m) => [m.default_owner_actor_id, m.default_reviewer_actor_id])
          .filter((v): v is string => !!v),
      ),
    ],
    [systems],
  );
  const ownerTeamIds = useMemo(
    () => [
      ...new Set(
        systems
          .flatMap((m) => [m.default_owner_team_id, m.default_reviewer_team_id])
          .filter((v): v is string => !!v),
      ),
    ],
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
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: managedSystemsQueryKey }),
      queryClient.invalidateQueries({ queryKey: ['managed-system-default-diagnostics'] }),
      queryClient.invalidateQueries({ queryKey: ['managed-system-default-candidates'] }),
    ]);
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
    diagnosticsQuery,
    requestsCount: requestsQuery.data?.count ?? 0,
    invalidate,
  };
}

export function useRegistryActorOptions(managedSystemId: string | undefined, reviewer: boolean) {
  const query = useQuery({
    queryKey: ['managed-system-default-candidates', managedSystemId],
    queryFn: ({ signal }) => fetchManagedSystemDefaultCandidates(managedSystemId, signal),
    retry: false,
    staleTime: 0,
  });
  return { ...query, data: reviewer ? query.data?.reviewers : query.data?.owners };
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

function useDefaultDiagnostics() {
  return useQuery({
    queryKey: ['managed-system-default-diagnostics'],
    queryFn: ({ signal }) => fetchManagedSystemDefaultDiagnostics(signal),
    retry: false,
  });
}
