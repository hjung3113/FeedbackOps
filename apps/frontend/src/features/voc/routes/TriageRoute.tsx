// TriageRoute — mounts <VocTriageScreen> inside the existing WorkbenchShell slot.
//
// Reads URL state (tab, managedSystem, selected) from the route search.
// Owns data fetching via useVocList({ view: 'triage', tab }).
//
// Architecture (from PLAN-21 §Architecture sketch):
//   No new route file-route. /vocs?view=triage mounts TriageRoute from vocs.tsx
//   if (search.view === 'triage'). TriageRoute is exported as a plain component.
//
// Decision D-1.2: Triage view does NOT read sort= from URL (server-pinned per #15).
// Decision D-1.3: useVocList reused (not forked) — backend differentiates shape.

import * as React from 'react';
import { useSearch, useNavigate } from '@tanstack/react-router';
import { useVocList } from '../hooks/useVocList';
import { VocTriageScreen, type TriageTab } from '../components/triage/VocTriageScreen';

// ── URL state shape ───────────────────────────────────────────────────────────

interface TriageSearch {
  tab?: TriageTab;
  managedSystem?: string;
  selected?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TriageRoute(): React.ReactElement {
  const search = useSearch({ strict: false }) as TriageSearch;
  const navigate = useNavigate();

  // Active tab defaults to 'unassigned' when not set in URL
  const activeTab: TriageTab = (search.tab as TriageTab | undefined) ?? 'unassigned';

  // Fetch triage queue — server-pinned sort, no sort param sent (D-1.2)
  const { data, isLoading } = useVocList({
    view: 'triage',
    ...(search.managedSystem !== undefined ? { managedSystemId: search.managedSystem } : {}),
    tab: activeTab,
  });

  const items = data?.items ?? [];
  const outOfScopeSummary = data?.out_of_scope_summary;

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleTabChange(tab: TriageTab): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void navigate({ to: '/vocs', search: (prev: any) => ({ ...prev, tab }) as any });
  }

  function handleSelectVoc(id: string): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void navigate({ to: '/vocs', search: (prev: any) => ({ ...prev, selected: id }) as any });
  }

  // ── Loading state ────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-sm text-text-muted">불러오는 중…</span>
      </div>
    );
  }

  return (
    <VocTriageScreen
      items={items}
      selectedId={search.selected ?? null}
      activeTab={activeTab}
      {...(outOfScopeSummary !== undefined ? { outOfScopeSummary } : {})}
      onSelectVoc={handleSelectVoc}
      onTabChange={handleTabChange}
    />
  );
}

TriageRoute.displayName = 'TriageRoute';
