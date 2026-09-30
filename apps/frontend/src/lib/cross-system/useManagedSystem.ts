import { fetchManagedSystems } from '@/lib/api';
import { managedSystemMarkColor } from '@fops/ui';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

export interface ResolvedManagedSystem {
  id: string;
  name: string;
  mark: string;
  archived: boolean;
}

export function useManagedSystem(id: string | null | undefined): ResolvedManagedSystem | null {
  const { data } = useQuery({
    queryKey: ['managed-systems', 'all'],
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived: true, signal }),
    staleTime: 10 * 60 * 1000,
  });

  return useMemo(() => {
    if (!id || !data) return null;
    const ms = data.items.find((item) => item.id === id);
    if (!ms) return null;
    return {
      id: ms.id,
      name: ms.name,
      mark: managedSystemMarkColor(ms.slug),
      archived: ms.archived_at !== null,
    };
  }, [id, data]);
}
