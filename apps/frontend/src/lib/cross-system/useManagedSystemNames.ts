import { fetchManagedSystems } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

export const managedSystemNamesQueryKey = ['managed-systems', 'all'] as const;

export function useManagedSystemNamesResult(
  options: {
    enabled?: boolean | undefined;
  } = {},
): { namesById: Map<string, string>; isSuccess: boolean } {
  const query = useQuery({
    queryKey: managedSystemNamesQueryKey,
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived: true, limit: 500, signal }),
    enabled: options.enabled ?? true,
    staleTime: 10 * 60 * 1000,
  });

  const namesById = useMemo(
    () => new Map((query.data?.items ?? []).map((system) => [system.id, system.name])),
    [query.data?.items],
  );
  return { namesById, isSuccess: query.isSuccess };
}

export function useManagedSystemNames(
  options: { enabled?: boolean | undefined } = {},
): Map<string, string> {
  return useManagedSystemNamesResult(options).namesById;
}
