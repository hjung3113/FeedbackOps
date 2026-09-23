// /admin/analytics-areas — Analytics Area catalog (issue #88).
//
// Rebuilt from the raw HTML-table CRUD harness to the design prototype
// (docs/design-prototype/screen-admin.jsx → AdminAreasScreen +
// AnalyticsAreaSlideOver). Live API data only; the prototype's window globals /
// synthetic data are not ported (AGENTS.md → Prototype Is The Spec). Maps the
// prototype's dark-token components to the real @fops/ui light-token components
// (ADR-0021 / Pack 17).
//
// Prototype-silent / locked deviations (recorded in the PR/commit body):
//   1. scope-mark color/mark — derived deterministically from slug+name via
//      features/admin/lib/scopeMark (the API has no color column). Shared with #87.
//   2. Lead — the prototype hard-codes a single user (u-1). The DTO carries
//      `owner_team_id` only, resolved to a team name via GET /actors/resolve.
//   3. Created — from the live `created_at` (prototype shows a static literal).
//   4. Workload / Findings — Slice 4/5 surfaces (Findings/Evidence) are NOT
//      built. The section shells render as empty "—" placeholders with a
//      defer-with-issue note; no invented counts (locked decision).

import { Button, PageShell } from '@fops/ui';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import { PermissionGate } from '../permissions/permission-gate.js';
import { AnalyticsAreasBody } from './AnalyticsAreasContainer.js';
import { AnalyticsAreasFilter } from './AnalyticsAreasList.js';
import type { AnalyticsAreasSearch } from './search.js';

const SUBTITLE =
  'Analytics Area 는 Managed System 하위의 분류 라벨입니다. 권한 경계가 아니라 dashboard·triage 의 필터 차원입니다.';
const GUARDRAIL_TITLE = 'Analytics Area 는 MVP 권한 경계가 아닙니다';
const GUARDRAIL_BODY =
  'AA 는 Managed System 안에서의 분류·집계 단위로만 사용됩니다. AA 별 권한 분기는 MVP 범위 밖이며, scope 결정은 Managed System 만으로 이루어집니다.';

export function AnalyticsAreasAdminPage() {
  const search = useSearch({ strict: false }) as AnalyticsAreasSearch;
  const navigate = useNavigate({ from: '/admin/analytics-areas' });
  const [registerCtx, setRegisterCtx] = useState<{ open: boolean; msId: string | null }>({
    open: false,
    msId: null,
  });
  const managedSystemId = search.managedSystem;
  const includeArchived = search.includeArchived ?? false;

  // Filter changes drop `selected` in the same navigation; defaults are omitted
  // from the URL (never write undefined/false values).
  function handleManagedSystemChange(value: string | undefined): void {
    void navigate({
      to: '/admin/analytics-areas',
      search: (prev: AnalyticsAreasSearch) => {
        const { selected: _dropped, ...rest } = prev;
        if (value === undefined) {
          const { managedSystem: _managedSystem, ...restWithoutMs } = rest;
          return restWithoutMs;
        }
        return { ...rest, managedSystem: value };
      },
    });
  }

  function handleIncludeArchivedChange(value: boolean): void {
    void navigate({
      to: '/admin/analytics-areas',
      search: (prev: AnalyticsAreasSearch) => {
        const { selected: _dropped, ...rest } = prev;
        if (!value) {
          const { includeArchived: _includeArchived, ...restWithoutArchived } = rest;
          return restWithoutArchived;
        }
        return { ...rest, includeArchived: true };
      },
    });
  }

  function handleClearFilters(): void {
    void navigate({
      to: '/admin/analytics-areas',
      search: (prev: AnalyticsAreasSearch) => {
        const {
          managedSystem: _managedSystem,
          includeArchived: _includeArchived,
          selected: _selected,
          ...rest
        } = prev;
        return rest;
      },
    });
  }

  return (
    <PageShell
      header={{
        title: 'Analytics areas',
        subtitle: SUBTITLE,
        actions: (
          <PermissionGate capability="workspace.admin" fallback={null} loading={null}>
            <AnalyticsAreasFilter
              includeArchived={includeArchived}
              managedSystemId={managedSystemId}
              onIncludeArchivedChange={handleIncludeArchivedChange}
              onManagedSystemIdChange={handleManagedSystemChange}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={() => setRegisterCtx({ open: true, msId: null })}
              data-testid="aa-new-area-button"
            >
              <Plus className="h-4 w-4" />
              New area
            </Button>
          </PermissionGate>
        ),
      }}
    >
      <PermissionGate capability="workspace.admin">
        <AnalyticsAreasBody
          includeArchived={includeArchived}
          managedSystemId={managedSystemId}
          selectedId={search.selected}
          onClearFilters={handleClearFilters}
          registerCtx={registerCtx}
          setRegisterCtx={setRegisterCtx}
          guardrailTitle={GUARDRAIL_TITLE}
          guardrailBody={GUARDRAIL_BODY}
        />
      </PermissionGate>
    </PageShell>
  );
}
