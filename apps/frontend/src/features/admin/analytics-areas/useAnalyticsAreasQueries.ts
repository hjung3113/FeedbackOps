import { type QueryClient, useQuery } from '@tanstack/react-query';

import { fetchAnalyticsAreas, fetchManagedSystems, resolveActors } from '../../../lib/api';

export const AA_KEY = ['analytics-areas'] as const;

export function useManagedSystemsList(includeArchived: boolean) {
  return useQuery({
    queryKey: ['managed-systems', { includeArchived }] as const,
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived, signal }),
    retry: false,
  });
}

export function useAnalyticsAreasList(
  managedSystemId: string | undefined,
  includeArchived: boolean,
) {
  return useQuery({
    queryKey: [...AA_KEY, { managedSystemId, includeArchived }] as const,
    queryFn: ({ signal }) =>
      fetchAnalyticsAreas({
        ...(managedSystemId ? { managedSystemId } : {}),
        includeArchived,
        signal,
      }),
    retry: false,
  });
}

export function useAnalyticsAreaTeams(teamIds: string[]) {
  return useQuery({
    queryKey: ['actors-resolve', 'aa-teams', teamIds] as const,
    queryFn: ({ signal }) => resolveActors({ teamIds }, signal),
    enabled: teamIds.length > 0,
    retry: false,
  });
}

export async function invalidateAnalyticsAreas(qc: QueryClient): Promise<void> {
  await qc.invalidateQueries({ queryKey: AA_KEY });
}
