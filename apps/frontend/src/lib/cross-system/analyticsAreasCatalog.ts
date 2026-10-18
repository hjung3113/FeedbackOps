import { fetchAllAnalyticsAreas } from '../api/analytics-areas-all';

/**
 * The one Analytics Area read: every page, archived included. Callers that need active rows
 * filter `archived_at === null` themselves. The key stays under `['analytics-areas']` so admin
 * Area edits refresh it.
 */
export function analyticsAreasCatalogQuery(managedSystemId?: string) {
  return {
    queryKey: ['analytics-areas', 'catalog', managedSystemId ?? 'all'] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      fetchAllAnalyticsAreas({ signal, ...(managedSystemId ? { managedSystemId } : {}) }),
    staleTime: 10 * 60 * 1000,
  };
}

/** `select` for pickers that offer active Areas only. */
export function activeAnalyticsAreas<T extends { items: { archived_at: string | null }[] }>(
  catalog: T,
): T {
  return { ...catalog, items: catalog.items.filter((area) => area.archived_at === null) };
}
