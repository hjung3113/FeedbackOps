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
// REV-1 #9: actors with role_level 'user' lack voc.triage capability; they see
//           PermissionBlockedPanel instead of the queue.

import * as React from 'react';
import { useSearch, useNavigate } from '@tanstack/react-router';
import { PermissionBlockedPanel } from '@fops/ui';
import { useMe } from '@/lib/auth/useMe';
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
  const { data: me, isLoading: meLoading } = useMe();

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

  if (isLoading || meLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-sm text-text-muted">불러오는 중…</span>
      </div>
    );
  }

  // REV-1 #9: capability gate — only Admin and Developer actors have voc.triage.
  // Frontend role check per AGENTS.md: "Frontend screens compose typed API hooks
  // and shared components; they do not enforce backend permissions as truth."
  // role_level 'user' = Reporter — never has triage capability.
  // The authoritative check remains server-side; this gate provides UX feedback.
  const roleLevel = me?.actor.role_level?.toLowerCase();
  const hasTriageCapability = roleLevel !== undefined && roleLevel !== 'user';

  if (!hasTriageCapability) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <PermissionBlockedPanel
          state="blocked_not_requestable"
          category="Triage"
          reason="VOC triage는 Admin 또는 Developer 역할에게만 허용됩니다."
        />
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
