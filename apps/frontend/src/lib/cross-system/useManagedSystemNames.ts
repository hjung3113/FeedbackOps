import { fetchManagedSystems } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

export const managedSystemNamesQueryKey = ['managed-systems', 'all'] as const;

export function useManagedSystemNames(options: { enabled?: boolean } = {}): Map<string, string> {
  const query = useQuery({
    queryKey: managedSystemNamesQueryKey,
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived: true, signal }),
    enabled: options.enabled ?? true,
    staleTime: 10 * 60 * 1000,
  });

  return useMemo(
    () => new Map((query.data?.items ?? []).map((system) => [system.id, system.name])),
    [query.data?.items],
  );
}
