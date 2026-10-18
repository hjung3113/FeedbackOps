// Whole-catalog reads over GET /analytics-areas. A separate module from the single-page client so
// the walk goes through the exported `fetchAnalyticsAreas` (and a test can replace it).

import { type AnalyticsAreaDto, fetchAnalyticsAreas } from './analytics-areas';

// GET /analytics-areas caps limit at 500; paginate rather than raise it (F4).
const ANALYTICS_AREAS_PAGE_LIMIT = 500;

/**
 * Walk every page of GET /analytics-areas. Stops once the items in hand reach
 * `total`, or when a page comes back empty while `total` is still ahead.
 */
export async function fetchEveryAnalyticsAreaPage(options: {
  managedSystemId?: string;
  includeArchived?: boolean;
  signal?: AbortSignal;
}): Promise<{ items: AnalyticsAreaDto[]; total: number }> {
  const items: AnalyticsAreaDto[] = [];
  let total = 0;
  do {
    const page = await fetchAnalyticsAreas({
      ...options,
      limit: ANALYTICS_AREAS_PAGE_LIMIT,
      offset: items.length,
    });
    total = page.total;
    if (page.items.length === 0) break;
    items.push(...page.items);
  } while (items.length < total);
  return { items, total };
}

/** Every Area (archived included) of one Managed System, or of all of them. */
export function fetchAllAnalyticsAreas(options?: {
  managedSystemId?: string;
  signal?: AbortSignal;
}): Promise<{ items: AnalyticsAreaDto[]; total: number }> {
  return fetchEveryAnalyticsAreaPage({ ...options, includeArchived: true });
}
