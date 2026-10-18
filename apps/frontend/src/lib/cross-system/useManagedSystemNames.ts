import { fetchManagedSystems } from '@/lib/api/managed-systems';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

export const managedSystemNamesQueryKey = ['managed-systems', 'all'] as const;

/** The one all-systems read (archived included); every `['managed-systems', 'all']` caller uses it. */
export function managedSystemsCatalogQuery() {
  return {
    queryKey: managedSystemNamesQueryKey,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      fetchManagedSystems({ includeArchived: true, limit: 500, signal }),
    staleTime: 10 * 60 * 1000,
  };
}

export function useManagedSystemNamesResult(
  options: {
    enabled?: boolean | undefined;
  } = {},
): { namesById: Map<string, string>; isSuccess: boolean } {
  const query = useQuery({
    ...managedSystemsCatalogQuery(),
    enabled: options.enabled ?? true,
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
