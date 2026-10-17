import { useQuery } from '@tanstack/react-query';
import { fetchAnalyticsAreas } from './api/analytics-areas';
import { ANALYTICS_AREA_FILTER_COPY as COPY } from './copy/analytics-areas';

/** Resolve only through the authorized catalog, including archived classifications. */
export function useAnalyticsAreaFilterLabel(area: string | undefined, managedSystemId?: string) {
  const scope = managedSystemId === 'all' ? undefined : managedSystemId;
  const query = useQuery({
    queryKey: ['analytics-area-filter-label', area, scope],
    enabled: area !== undefined && area !== 'unset',
    retry: false,
    queryFn: async ({ signal }) => {
      let offset = 0;
      while (true) {
        const page = await fetchAnalyticsAreas({
          includeArchived: true,
          limit: 500,
          offset,
          signal,
          ...(scope === undefined ? {} : { managedSystemId: scope }),
        });
        const match = page.items.find((item) => item.id === area);
        if (match) return match;
        offset += page.items.length;
        if (offset >= page.total || page.items.length === 0) return null;
      }
    },
    staleTime: 30_000,
  });
  if (area === 'unset') return COPY.unset;
  if (query.isError || !query.data || query.data.id !== area) return COPY.unresolved;
  return COPY.resolved(query.data.name, query.data.archived_at !== null);
}
