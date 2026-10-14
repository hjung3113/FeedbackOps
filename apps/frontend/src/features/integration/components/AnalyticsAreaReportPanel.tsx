import { ListStateMessage } from '@/components/ListStateMessage';
import { fetchAnalyticsAreaReport } from '@/lib/api/area-report';
import { isPermissionDenied } from '@/lib/api/types';
import { useMe } from '@/lib/auth/useMe';
import { AREA_REPORT_COPY as COPY } from '@/lib/copy/area-report';
import { Button, PermissionBlockedPanel, SkeletonRows } from '@fops/ui';
import { useQuery } from '@tanstack/react-query';
import { AnalyticsAreaReportTable } from './AnalyticsAreaReportTable';

export function AnalyticsAreaReportPanel({
  managedSystemId,
  area,
  cursor,
  onPage,
}: {
  managedSystemId: string | undefined;
  area: string | undefined;
  cursor: string | undefined;
  onPage: (cursor: string | undefined) => void;
}) {
  const me = useMe();
  const query = useQuery({
    queryKey: [
      'dashboard-area-report',
      me.data?.workspace_id,
      me.data?.actor.id,
      managedSystemId ?? 'all',
      area ?? 'all',
      cursor ?? 'first',
    ],
    enabled: me.isSuccess,
    retry: false,
    queryFn: ({ signal }) =>
      fetchAnalyticsAreaReport(
        {
          ...(managedSystemId ? { managed_system_id: managedSystemId } : {}),
          ...(area ? { analytics_area_id: area } : {}),
          ...(cursor ? { cursor } : {}),
        },
        signal,
      ),
  });
  if (query.isPending)
    return (
      <div data-testid="area-report-pending">
        <SkeletonRows count={4} size="compact" />
      </div>
    );
  if (query.isError)
    return isPermissionDenied(query.error) ? (
      <PermissionBlockedPanel state="denied" category={COPY.tab} />
    ) : (
      <ListStateMessage
        variant="error"
        title={COPY.error}
        action={{ label: COPY.retry, onClick: () => void query.refetch() }}
      />
    );
  return (
    <div className="flex flex-col gap-3">
      {query.data.items.length === 0 ? (
        <ListStateMessage variant="empty" title={COPY.empty} />
      ) : (
        <AnalyticsAreaReportTable report={query.data} />
      )}
      <div className="flex justify-end gap-2">
        {cursor && (
          <Button variant="secondary" size="sm" onClick={() => onPage(undefined)}>
            {COPY.first}
          </Button>
        )}
        {query.data.page.has_more && query.data.page.cursor && (
          <Button variant="secondary" size="sm" onClick={() => onPage(query.data.page.cursor)}>
            {COPY.next}
          </Button>
        )}
      </div>
    </div>
  );
}
