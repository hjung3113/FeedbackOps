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
//
// REV-2 #9 + NEW-3: capability gate is now driven by the authoritative
// /me/permissions/check?capability=voc.triage decision (via usePermissionCheck),
// NOT by the role_level display label. Per docs/design/09-permission-access.md
// ("frontend must not derive authorization from display labels"), a Developer
// without scoped voc.triage capability must be blocked even though their
// role_level is not 'user'. The gate also runs BEFORE the triage queue fetch
// (enabled:false on the useVocList query) so a blocked actor never triggers
// a queue query.

import * as React from 'react';
import { useSearch, useNavigate } from '@tanstack/react-router';
import { PermissionBlockedPanel } from '@fops/ui';
import { useMe } from '@/lib/auth/useMe';
import { usePermissionCheck } from '@/features/admin/permissions/use-permission-check';
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
  const { isLoading: meLoading } = useMe();

  // Active tab defaults to 'unassigned' when not set in URL
  const activeTab: TriageTab = (search.tab as TriageTab | undefined) ?? 'unassigned';

  // REV-2 #9: authoritative capability check (server-decided). Runs in
  // parallel with /me; the queue query stays disabled until the decision
  // is 'approved'.
  const capCheck = usePermissionCheck({
    capability: 'voc.triage',
    ...(search.managedSystem !== undefined ? { managedSystemId: search.managedSystem } : {}),
  });
  const isApproved = capCheck.data?.state === 'approved';

  // Fetch triage queue — server-pinned sort, no sort param sent (D-1.2).
  // REV-2 #9: gate BEFORE fetch via enabled:false so a blocked actor doesn't
  // trigger a queue query (and doesn't see a flash of queue chrome).
  // #383: a deep link from the VOC detail panel ("트리아지에서 변경") carries its
  // target as `selected`. Already-triaged VOCs are excluded by the queue
  // predicate, so the target must be pinned explicitly or the queue cannot show
  // it. Out-of-scope / unknown ids are dropped server-side.
  const { data, isLoading } = useVocList({
    view: 'triage',
    ...(search.managedSystem !== undefined ? { managedSystemId: search.managedSystem } : {}),
    tab: activeTab,
    ...(search.selected !== undefined ? { pinVocId: search.selected } : {}),
    enabled: isApproved,
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

  if (meLoading || capCheck.isPending) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-sm text-text-muted">불러오는 중…</span>
      </div>
    );
  }

  // REV-2 #9: capability-driven gate. Any non-approved state (incl. blocked,
  // request_access, pending, denied) renders PermissionBlockedPanel.
  // capCheck.isError is also treated as blocked to avoid flashing the queue
  // when the check failed.
  if (!isApproved) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <PermissionBlockedPanel
          state={mapToPanelState(capCheck.data?.state)}
          category="Triage"
          reason="VOC triage 권한이 없습니다. 워크스페이스 관리자에게 권한을 요청하세요."
        />
      </div>
    );
  }

  // Approved branch: show queue loading spinner separately from the gate.
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

// Maps the FE permission-check state enum (FrontendPermissionState) to the
// narrower PermissionBlockedPanel state enum (PermissionState in @fops/ui).
// Both spellings of "not requestable" exist historically — the API uses
// 'blocked_non_requestable' while the UI primitive uses
// 'blocked_not_requestable'. This mapping isolates that drift to one place.
function mapToPanelState(
  state: string | undefined,
): 'request_access' | 'summary_visible' | 'denied' | 'blocked_not_requestable' {
  switch (state) {
    case 'request_access':
      return 'request_access';
    case 'summary_visible':
      return 'summary_visible';
    case 'rejected':
    case 'expired':
    case 'revoked':
      return 'denied';
    // 'approved' should never reach this mapper (handled above) — fall through.
    default:
      return 'blocked_not_requestable';
  }
}
