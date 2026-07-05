import { createFileRoute, Link } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { FindingDetailPanel } from '@/features/integration/components/FindingDetail';

export const Route = createFileRoute('/_authed/findings/$findingId')({
  component: FindingDetailRoute,
});

function FindingDetailRoute() {
  const { findingId } = Route.useParams();

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-canvas">
      <div className="flex shrink-0 items-center justify-between border-b border-border-subtle px-6 py-3">
        <div className="flex flex-col gap-1">
          <Link
            to="/vocs"
            search={{ view: 'inbox' }}
            className="inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-1 text-sm text-text-muted hover:bg-surface-card hover:text-text-primary"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            <span>VOC Inbox</span>
          </Link>
          <h1 className="text-lg font-semibold text-text-primary">
            Finding 상세
          </h1>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-4">
        <div className="mx-auto h-full max-w-4xl overflow-hidden rounded-lg border border-border-subtle bg-surface-detail shadow-sm">
          <FindingDetailPanel findingId={findingId} />
        </div>
      </div>
    </div>
  );
}
