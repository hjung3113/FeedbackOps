import { dashboardAreaReportQuerySchema, dashboardAreaReportSchema } from '@fops/shared';
import type { z } from 'zod';
import { apiRequest } from './client';

export async function fetchAnalyticsAreaReport(
  query: z.input<typeof dashboardAreaReportQuerySchema>,
  signal?: AbortSignal,
) {
  const parsed = dashboardAreaReportQuerySchema.parse(query);
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(parsed)) {
    // `limit` has a schema default; send it only when the caller chose one.
    if (value === undefined || (key === 'limit' && query.limit === undefined)) continue;
    search.set(key, String(value));
  }
  return (
    await apiRequest('GET', `/dashboard/analytics-areas?${search}`, dashboardAreaReportSchema, {
      ...(signal ? { signal } : {}),
    })
  ).data;
}
