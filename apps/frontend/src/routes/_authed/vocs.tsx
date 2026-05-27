// /vocs — per-view shell selection route. Auth gate is inherited from
// the /_authed pathless layout route. Shell selection follows ADR-0020
// §taxonomy lock: inbox/my → ListShell, triage → WorkbenchShell,
// action=create → PageShell. Feature content (list rows, detail panel,
// create form, triage queue) lands in #19 / #20 / #21.

import { ListShell, PageShell, WorkbenchShell } from '@fops/ui';
import { createFileRoute, useSearch } from '@tanstack/react-router';
import { CreateRoute } from '@/features/voc/routes/CreateRoute';
import { useInboxRoute } from '@/features/voc/routes/InboxRoute';
import { TriageRoute } from '@/features/voc/routes/TriageRoute';
import { z } from 'zod';

const vocSearchSchema = z
  .object({
    view: z.enum(['inbox', 'my', 'triage']).optional(),
    action: z.enum(['create']).optional(),
    selected: z.string().uuid().optional(),
    managedSystem: z.string().optional(),
    // D-1.1: 'waiting' appended (Chunk 1 — S3-008 decision); existing values stay.
    // All four triage tabs (unassigned/untriaged/high/waiting) share the same tab= param
    // as inbox tabs per the #18 schema lock.
    tab: z.enum(['untriaged', 'high', 'unassigned', 'similar', 'no-link', 'waiting']).optional(),
    sort: z.enum([
      'created_at:desc',
      'created_at:asc',
      'severity:desc',
      'severity:asc',
      'reporter_facing_status:asc',
    ]).optional(),
    // filter.* keys reserved for #20 per-view filters. Declared as explicit
    // dot-keys here to keep .strict() — no open-ended passthrough.
    'filter.severity': z.string().optional(),
    'filter.reporterStatus': z.string().optional(),
    'filter.owner': z.string().optional(),
  })
  .strict(); // reject unknown query keys — prevents link-poisoning as #20 grows

type VocSearch = z.infer<typeof vocSearchSchema>;

export const Route = createFileRoute('/_authed/vocs')({
  validateSearch: (raw) => vocSearchSchema.parse(raw),
  component: VocRouteShell,
});

// Exported for testing — tests mount this component directly in a createRoute harness.
export function VocRouteShell() {
  // useSearch() (without route arg) reads from the nearest matched route context.
  // This works in both the file-route context and test harnesses that mount
  // this component as the route component.
  const search = useSearch({ strict: false }) as VocSearch;

  // Per-view shell selection. spec voc.md §2 + ADR-0020 §taxonomy lock.
  if (search.action === 'create') {
    return (
      <PageShell header={{ title: '새 VOC 작성' }}>
        <CreateRoute />
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
  const view = search.view ?? 'inbox';
  return <InboxShell view={view} />;
}

// ── InboxShell ────────────────────────────────────────────────────────────────
//
// Composition decision: useInboxRoute() returns three render slots
// (toolbar, list, detailPanel) that are composed here inside ListShell.
// This keeps ListShell as the ADR-0020-locked wrapper in the route file while
// giving InboxRoute full ownership of URL state + data logic.
// Returning an object from a hook avoids the anti-pattern of rendering
// an object from a component function.

function InboxShell({ view }: { view: 'inbox' | 'my' }) {
  const { list, detailPanel } = useInboxRoute(view);
  return (
    <ListShell
      list={list}
      {...(detailPanel !== undefined ? { detailPanel } : {})}
    />
  );
}


