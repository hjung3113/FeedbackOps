import type { AnalyticsAreaDto } from '../../../lib/api';

export function groupAreasByMs(
  items: AnalyticsAreaDto[],
  includeArchived: boolean,
): Map<string, AnalyticsAreaDto[]> {
  const out = new Map<string, AnalyticsAreaDto[]>();
  for (const a of items) {
    if (!includeArchived && a.archived_at !== null) continue;
    const arr = out.get(a.managed_system_id) ?? [];
    arr.push(a);
    out.set(a.managed_system_id, arr);
  }
  return out;
}
