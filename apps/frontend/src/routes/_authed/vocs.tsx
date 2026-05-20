// /vocs — per-view shell selection route. Auth gate is inherited from
// the /_authed pathless layout route. Shell selection follows ADR-0020
// §taxonomy lock: inbox/my → ListShell, triage → WorkbenchShell,
// action=create → PageShell. Feature content (list rows, detail panel,
// create form, triage queue) lands in #19 / #20 / #21.

import { ListShell, PageShell, WorkbenchShell } from '@fops/ui';
import { Link, createFileRoute, useSearch } from '@tanstack/react-router';
import { z } from 'zod';

const vocSearchSchema = z
  .object({
    view: z.enum(['inbox', 'my', 'triage']).optional(),
    action: z.enum(['create']).optional(),
    selected: z.string().uuid().optional(),
    managedSystem: z.string().optional(),
    tab: z.string().optional(),
    sort: z.string().optional(),
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
      <PageShell header={{ title: 'New VOC' }}>
        <Placeholder kind="create" />
      </PageShell>
    );
  }
  if (search.view === 'triage') {
    return (
      <WorkbenchShell toolbar={{ title: 'Triage Console' }}>
        <Placeholder kind="triage" />
      </WorkbenchShell>
    );
  }
  // inbox / my / default
  const view = search.view ?? 'inbox';
  const title = view === 'my' ? 'My VOCs' : 'Inbox';
  return (
    <ListShell
      toolbar={{
        title,
        actions: (
          <Link
            to="/vocs"
            search={{ action: 'create' }}
            className="text-sm text-accent-primary hover:underline"
          >
            + New VOC
          </Link>
        ),
      }}
      tabs={
        <div className="flex gap-3 text-sm">
          <ViewTab to={{ view: 'inbox' }} active={view === 'inbox'}>
            Inbox
          </ViewTab>
          <ViewTab to={{ view: 'my' }} active={view === 'my'}>
            My VOCs
          </ViewTab>
        </div>
      }
      list={<Placeholder kind={view} />}
    />
  );
}

function Placeholder({ kind }: { kind: string }) {
  return (
    <div className="p-8 text-center text-text-muted">
      <p className="text-sm">
        VOC routes — <code>{kind}</code> view.
      </p>
      <p className="text-xs mt-1">
        Content lands in #19 (Create) / #20 (Inbox+Detail) / #21 (Triage).
      </p>
    </div>
  );
}

function ViewTab({
  to,
  active,
  children,
}: {
  to: { view: 'inbox' | 'my' | 'triage' };
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to="/vocs"
      search={to}
      className={
        active
          ? 'border-b-2 border-accent-primary text-text-primary pb-1'
          : 'text-text-muted hover:text-text-primary pb-1'
      }
    >
      {children}
    </Link>
  );
}
