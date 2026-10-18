import { useQuery } from '@tanstack/react-query';
import { ANALYTICS_AREA_FILTER_COPY as COPY } from './copy/analytics-areas';
import { analyticsAreasCatalogQuery } from './cross-system/analyticsAreasCatalog';

/** Resolve only through the authorized catalog, including archived classifications. */
export function useAnalyticsAreaFilterLabel(area: string | undefined, managedSystemId?: string) {
  const scope = managedSystemId === 'all' ? undefined : managedSystemId;
  const catalog = useQuery({
    ...analyticsAreasCatalogQuery(scope),
    enabled: area !== undefined && area !== 'unset',
    retry: false,
  });
  const match = catalog.data?.items.find((item) => item.id === area);
  if (area === 'unset') return COPY.unset;
  if (catalog.isError || !match) return COPY.unresolved;
  return COPY.resolved(match.name, match.archived_at !== null);
}
