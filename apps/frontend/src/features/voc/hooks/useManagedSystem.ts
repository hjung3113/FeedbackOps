import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchManagedSystems } from '@/lib/api';

// djb2 hash → one of 8 Pack-17-friendly hex colors.
const COLOR_PALETTE = [
  '#5e6ad2', // aether-blue
  '#27a644', // emerald
  '#f2c46d', // amber
  '#8b5cf6', // amethyst
  '#02b8cc', // cyan-spark
  '#ef4444', // warning-red
  '#e4f222', // neon-lime
  '#7c3aed', // deep-violet
] as const;

function djb2Hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    // djb2: h = ((h << 5) + h) + charCode
    h = (Math.imul(h, 33) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function colorFromId(id: string): string {
  return COLOR_PALETTE[djb2Hash(id) % COLOR_PALETTE.length] as string;
}

export interface ResolvedManagedSystem {
  id: string;
  name: string;
  mark: string;
  archived: boolean;
}

export function useManagedSystem(
  id: string | null | undefined,
): ResolvedManagedSystem | null {
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
      mark: colorFromId(ms.id),
      archived: ms.archived_at !== null,
    };
  }, [id, data]);
}
