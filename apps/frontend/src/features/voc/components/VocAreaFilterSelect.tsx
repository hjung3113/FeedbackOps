import { fetchAnalyticsAreas, fetchManagedSystems } from '@/lib/api';
import { AREA_REPORT_COPY as AREA_COPY } from '@/lib/copy/area-report';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fops/ui';
import { useQuery } from '@tanstack/react-query';

const ALL = 'all';

/**
 * Single-select Analytics Area filter shared by the Inbox and Triage toolbars
 * (mirrors the Coverage Area select). `value` is the URL `filter.analytics_area`:
 * absent = all areas, `unset` = VOCs without an area, otherwise an area id.
 */
export function VocAreaFilterSelect({
  value,
  managedSystemId,
  onChange,
}: {
  value: string | undefined;
  managedSystemId: string | undefined;
  /** `undefined` clears the filter. */
  onChange: (next: string | undefined) => void;
}) {
  // `all` and an absent Managed System both query without a System scope.
  const scope =
    managedSystemId !== undefined && managedSystemId !== ALL ? managedSystemId : undefined;
  // Reuse the global Managed System switcher's visible registry query.
  const systems = useQuery({
    queryKey: ['managed-systems', 'scope-selector'] as const,
    queryFn: ({ signal }) => fetchManagedSystems({ signal }),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const areas = useQuery({
    queryKey: ['voc-area-filter-options', scope],
    retry: false,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const items: Awaited<ReturnType<typeof fetchAnalyticsAreas>>['items'] = [];
      let offset = 0;
      while (true) {
        const page = await fetchAnalyticsAreas({
          includeArchived: true,
          limit: 500,
          offset,
          signal,
          ...(scope === undefined ? {} : { managedSystemId: scope }),
        });
        items.push(...page.items);
        offset += page.items.length;
        if (offset >= page.total || page.items.length === 0) return items;
      }
    },
  });

  const systemNames = new Map((systems.data?.items ?? []).map((item) => [item.id, item.name]));
  const offeredAreas = (areas.data ?? []).filter(
    (item) =>
      systemNames.has(item.managed_system_id) &&
      (scope === undefined || item.managed_system_id === scope),
  );
  const showSystemName = new Set(offeredAreas.map((item) => item.managed_system_id)).size > 1;

  return (
    <Select
      value={value ?? ALL}
      onValueChange={(next) => {
        onChange(next === ALL ? undefined : next);
      }}
    >
      <SelectTrigger aria-label="Analytics Area" density="compact" className="w-48">
        <SelectValue placeholder={AREA_COPY.allAreas} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value={ALL}>{AREA_COPY.allAreas}</SelectItem>
          <SelectItem value="unset">{AREA_COPY.unset}</SelectItem>
          {offeredAreas.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.name}
              {showSystemName ? ` · ${systemNames.get(item.managed_system_id)}` : ''}
              {item.archived_at ? ` · ${AREA_COPY.archived}` : ''}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
