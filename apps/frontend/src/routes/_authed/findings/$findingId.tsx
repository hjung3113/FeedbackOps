import { PageShell } from '@fops/ui';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { FindingDetailPanel } from '@/features/integration/components/FindingDetail';

export const Route = createFileRoute('/_authed/findings/$findingId')({
  component: FindingDetailRoute,
});

function FindingDetailRoute() {
  const { findingId } = Route.useParams();

  return (
    <PageShell
      header={{
        title: 'Finding 상세',
        subtitle: (
          <div className="flex items-center gap-2">
            <Link
              to="/vocs"
              search={{ view: 'inbox' }}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-text-muted hover:bg-surface-card hover:text-text-primary"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              <span>VOC Inbox</span>
            </Link>
          </div>
        ),
      }}
    >
      <FindingDetailPanel findingId={findingId} />
    </PageShell>
  );
}
