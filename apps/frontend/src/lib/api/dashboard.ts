import { dashboardSummarySchema, type DashboardSummary } from '@fops/shared';

import { apiClient } from './client';

/** The strict shared schema is the boundary: omitted keys remain omitted. */
export async function fetchDashboardSummary(options: {
  managedSystemId?: string;
  signal?: AbortSignal;
} = {}): Promise<DashboardSummary> {
  const params = new URLSearchParams({ managed_system_id: options.managedSystemId ?? 'all' });
  const response = await apiClient<unknown>('GET', `/dashboard/summary?${params.toString()}`, {
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
  return dashboardSummarySchema.parse(response.data);
}
