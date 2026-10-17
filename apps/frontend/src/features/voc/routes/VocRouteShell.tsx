// VocRouteShell — per-view shell selection for /vocs. Moved out of the route
// file for #982: the router plugin only code-splits a route when its component
// is not an exported local, so the shell lives in the feature layer and the
// route file imports it. Shell selection follows ADR-0020 §taxonomy lock:
// inbox/my → ListShell, triage → WorkbenchShell, action=create → PageShell.

import { CreateRoute } from '@/features/voc/routes/CreateRoute';
import { useInboxRoute } from '@/features/voc/routes/InboxRoute';
import { TriageRoute } from '@/features/voc/routes/TriageRoute';
import { VOC_DEFAULT_VIEW } from '@/features/voc/routes/voc-search';
import type { VocSearch } from '@/features/voc/routes/voc-search';
import { fetchNavCounts } from '@/lib/api/nav';
import { GLOSSARY, createLabel } from '@/lib/copy/glossary';
import { NAV_COUNTS_QUERY_KEY } from '@/lib/query/navCounts';
import { ListShell, PageShell, WorkbenchShell } from '@fops/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearch } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';

// Exported for testing — tests mount this component directly in a createRoute
// harness (test/mountAuthedVocs.tsx).
export function VocRouteShell() {
  // useSearch() (without route arg) reads from the nearest matched route context.
  // This works in both the file-route context and test harnesses that mount
  // this component as the route component.
  const search = useSearch({ strict: false }) as VocSearch;
  const navCountsQuery = useQuery({
    queryKey: [...NAV_COUNTS_QUERY_KEY, search.managedSystem] as const,
    queryFn: ({ signal }) =>
      fetchNavCounts({
        signal,
        ...(search.managedSystem !== undefined ? { managedSystemId: search.managedSystem } : {}),
      }),
    enabled: search.action === 'create',
    retry: false,
  });
  // Match AppRail: while counts are unavailable, keep the Inbox destination;
  // an omitted key in a settled counts response means this actor has no Inbox.
  const createBackView =
    navCountsQuery.data === undefined || navCountsQuery.data.counts['voc.inbox'] !== undefined
      ? 'inbox'
      : 'my';

  // Per-view shell selection. spec voc.md §2 + ADR-0020 §taxonomy lock.
  if (search.action === 'create') {
    return (
      <PageShell
        header={{
          title: '새 VOC 작성',
          subtitle: (
            <div className="flex items-center gap-2">
              <Link
                to="/vocs"
                search={{ view: createBackView }}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-text-muted hover:bg-surface-card hover:text-text-primary"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                <span>{createBackView === 'inbox' ? GLOSSARY.inbox : GLOSSARY.myVocs}</span>
              </Link>
              <span className="inline-flex items-center gap-1 rounded-md bg-accent-primary/10 px-2 py-1 text-xs font-medium text-accent-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-accent-primary" aria-hidden />
                {createLabel('VOC')}
              </span>
            </div>
          ),
        }}
      >
        <CreateRoute backView={createBackView} />
      </PageShell>
    );
  }
  if (search.view === 'triage') {
    // V1 inline kicker: toolbar prop removed — VocTriageScreen absorbs route
    // identity as a left-edge kicker ("Console · Triage") in its own toolbar.
    // ShellHeader is intentionally absent for this route only (ADR-0020 §optional header).
    return (
      <WorkbenchShell>
        <TriageRoute />
      </WorkbenchShell>
    );
  }
  // inbox / my / default
  const view = search.view ?? VOC_DEFAULT_VIEW;
  return <InboxShell view={view} />;
}

// ── InboxShell ────────────────────────────────────────────────────────────────
//
// Composition decision: useInboxRoute() returns three render slots
// (toolbar, list, detailPanel) that are composed here inside ListShell.
// This keeps ListShell as the ADR-0020-locked wrapper in the route composition
// while giving InboxRoute full ownership of URL state + data logic.
// Returning an object from a hook avoids the anti-pattern of rendering
// an object from a component function.

function InboxShell({ view }: { view: 'inbox' | 'my' }) {
  const { list, detailPanel } = useInboxRoute(view);
  return <ListShell list={list} {...(detailPanel !== undefined ? { detailPanel } : {})} />;
}
