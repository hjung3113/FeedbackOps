// /admin/managed-systems — Managed System Registry (issue #87).
//
// Rebuilt from the raw HTML-table CRUD harness to the design prototype
// (docs/design-prototype/screen-admin.jsx → AdminScreen). Live API data only;
// the prototype's window globals / synthetic data are not ported (AGENTS.md
// → Prototype Is The Spec). Maps the prototype's dark-token components to the
// real @fops/ui light-token components (ADR-0021 / Pack 17).
//
// Prototype-silent deviations recorded in the PR/commit body:
//   1. scope-mark color/mark — derived deterministically from slug+name via
//      features/admin/lib/scopeMark (the API has no color column).
//   2. Default owner — resolved via GET /actors/resolve (#87 new endpoint);
//      the prototype hard-codes a single user.

import {
  Button,
  Checkbox,
  OutlineBadge,
  PageShell,
  Popover,
  PopoverContent,
  PopoverTrigger,
  UserChip,
} from '@fops/ui';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Filter, Plus, Shield } from 'lucide-react';
import { useState } from 'react';

import type { AnalyticsAreaDto, ManagedSystemDto, ResolveActorsResponse } from '../../../lib/api';
import { envelopeMessage } from '../lib/envelopeMessage.js';
import { scopeMark } from '../lib/scopeMark.js';
import { PermissionGate } from '../permissions/permission-gate.js';

import { EditDialog, RegisterDialog } from './ManagedSystemsDialogs.js';
import { useManagedSystemsRegistry } from './useManagedSystemsRegistry.js';

const SUBTITLE =
  'Managed System 은 MVP 의 권한·집계 단위입니다. Project 가 아닙니다. 각 시스템의 default owner, AA 매핑, 활성 상태를 관리합니다.';

export function ManagedSystemsAdminPage() {
  const [registerOpen, setRegisterOpen] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  return (
    <PageShell
      header={{
        title: 'Managed systems',
        subtitle: SUBTITLE,
        actions: (
          <PermissionGate capability="workspace.admin" fallback={null} loading={null}>
            <ManagedSystemsFilter
              includeArchived={includeArchived}
              onIncludeArchivedChange={setIncludeArchived}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={() => setRegisterOpen(true)}
              data-testid="ms-register-button"
            >
              <Plus className="h-4 w-4" />
              Register system
            </Button>
          </PermissionGate>
        ),
      }}
    >
      <PermissionGate capability="workspace.admin">
        <ManagedSystemsBody
          includeArchived={includeArchived}
          registerOpen={registerOpen}
          setRegisterOpen={setRegisterOpen}
        />
      </PermissionGate>
    </PageShell>
  );
}

function ManagedSystemsBody({
  includeArchived,
  registerOpen,
  setRegisterOpen,
}: {
  includeArchived: boolean;
  registerOpen: boolean;
  setRegisterOpen: (v: boolean) => void;
}) {
  const [editTarget, setEditTarget] = useState<ManagedSystemDto | null>(null);
  // Archived rows cannot be restored (ADR-0019 §A: archived rows are immutable).
  // The designed remedy for "archived by mistake" is re-registering the same
  // slug (ADR-0017), so Configure hands the archived row's fields to Register.
  const [reregisterFrom, setReregisterFrom] = useState<ManagedSystemDto | null>(null);

  const { systems, areasByMs, renderedAreaCount, resolved, listQuery, requestsCount, invalidate } =
    useManagedSystemsRegistry(includeArchived);

  return (
    <section className="space-y-8">
      {/* ── Registry ──────────────────────────────────────────────── */}
      <div>
        <div className="mb-3.5 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Registry
          </h3>
          <span className="text-xs text-text-muted">
            {systems.length} systems · {renderedAreaCount} analytics areas
          </span>
        </div>

        {listQuery.isPending ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : listQuery.isError ? (
          <p className="text-sm text-accent-danger" data-testid="ms-list-error">
            Error: {envelopeMessage(listQuery.error)}
          </p>
        ) : systems.length === 0 ? (
          <div
            className="rounded-md border border-border-subtle bg-surface-card p-8 text-center text-sm text-text-muted"
            data-testid="ms-empty-state"
          >
            등록된 Managed System 이 없습니다.
          </div>
        ) : (
          <div
            data-testid="managed-systems-registry"
            className="overflow-hidden rounded-md border border-border-subtle bg-surface-card"
          >
            {systems.map((m, i) => (
              <RegistryRow
                key={m.id}
                row={m}
                areas={areasByMs.get(m.id) ?? []}
                resolved={resolved}
                last={i === systems.length - 1}
                onConfigure={() => setEditTarget(m)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Permission requests ───────────────────────────────────── */}
      <div>
        <div className="mb-3.5 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Permission requests
          </h3>
          <Button variant="primary" size="sm" asChild>
            <Link to="/admin/permissions/requests" data-testid="ms-open-review-console">
              <ArrowRight className="h-3 w-3" />
              Open review console
            </Link>
          </Button>
        </div>
        <div className="flex items-center gap-3.5 rounded-md border border-border-subtle bg-surface-card p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-warn/10 text-accent-warn">
            <Shield className="h-4 w-4" />
          </span>
          <div className="flex flex-1 flex-col gap-0.5">
            <div
              className="text-base font-semibold text-text-primary"
              data-testid="ms-requests-count"
            >
              {requestsCount} requests awaiting decision
            </div>
            <span className="text-xs text-text-muted">
              Pending · Needs more info · High-risk · Self-approval 까지 검토 콘솔에서 확인합니다.
            </span>
          </div>
          <Button variant="secondary" size="sm" asChild>
            <Link to="/admin/permissions/requests" data-testid="ms-review-button">
              <ArrowRight className="h-3 w-3" />
              Review
            </Link>
          </Button>
        </div>
      </div>

      <RegisterDialog
        key={reregisterFrom?.id ?? 'blank'}
        open={registerOpen}
        prefill={reregisterFrom}
        onOpenChange={(open) => {
          setRegisterOpen(open);
          if (!open) setReregisterFrom(null);
        }}
        onSaved={async () => {
          setRegisterOpen(false);
          setReregisterFrom(null);
          await invalidate();
        }}
      />
      <EditDialog
        target={editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        onReregister={(target) => {
          setEditTarget(null);
          setReregisterFrom(target);
          setRegisterOpen(true);
        }}
        onSaved={async () => {
          setEditTarget(null);
          await invalidate();
        }}
      />
    </section>
  );
}

function ManagedSystemsFilter({
  includeArchived,
  onIncludeArchivedChange,
}: {
  includeArchived: boolean;
  onIncludeArchivedChange: (value: boolean) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="subtle" size="sm" data-testid="ms-filter-button">
          <Filter className="h-4 w-4" />
          Filter
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end">
        <label
          className="flex items-center gap-2 text-sm text-text-primary"
          htmlFor="ms-filter-include-archived"
        >
          <Checkbox
            id="ms-filter-include-archived"
            checked={includeArchived}
            onCheckedChange={(checked) => onIncludeArchivedChange(checked === true)}
            data-testid="ms-filter-include-archived"
          />
          Archived 포함
        </label>
      </PopoverContent>
    </Popover>
  );
}

function ownerUser(
  row: ManagedSystemDto,
  resolved: ResolveActorsResponse | undefined,
): { display_name: string } | null {
  if (row.default_owner_actor_id) {
    const a = resolved?.actors.find((x) => x.id === row.default_owner_actor_id);
    return a ? { display_name: a.display_name } : null;
  }
  if (row.default_owner_team_id) {
    const t = resolved?.teams.find((x) => x.id === row.default_owner_team_id);
    return t ? { display_name: t.name } : null;
  }
  return null;
}

function RegistryRow({
  row,
  areas,
  resolved,
  last,
  onConfigure,
}: {
  row: ManagedSystemDto;
  areas: AnalyticsAreaDto[];
  resolved: ResolveActorsResponse | undefined;
  last: boolean;
  onConfigure: () => void;
}) {
  const mark = scopeMark(row.slug, row.name);
  const owner = ownerUser(row, resolved);
  return (
    <div
      data-testid={`managed-system-row-${row.slug}`}
      className={`grid items-center gap-3 px-4 py-3${last ? '' : ' border-b border-border-subtle'}`}
      style={{ gridTemplateColumns: '40px 1.6fr 1.1fr 1.4fr 110px' }}
    >
      <div
        className="flex items-center justify-center rounded-md text-[11px] font-semibold text-white"
        style={{ width: 28, height: 28, background: mark.color }}
        aria-hidden="true"
      >
        {mark.label}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <div className="truncate text-sm font-medium text-text-primary">{row.name}</div>
          {row.archived_at !== null ? <OutlineBadge>Archived</OutlineBadge> : null}
        </div>
        <div className="truncate font-mono text-xs text-text-muted">managed-system/{row.slug}</div>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-text-muted">Default owner</span>
        {row.default_owner_actor_id === null && row.default_owner_team_id === null ? (
          <span className="text-xs text-text-muted">(미지정)</span>
        ) : (
          <UserChip user={owner} size="sm" />
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {areas.map((a) => (
          <OutlineBadge key={a.id}>
            {a.name}
            {a.archived_at !== null ? ' · Archived' : ''}
          </OutlineBadge>
        ))}
      </div>
      <div className="text-right">
        <Button
          variant="subtle"
          size="sm"
          onClick={onConfigure}
          data-testid={`ms-configure-${row.slug}`}
        >
          Configure
        </Button>
      </div>
    </div>
  );
}
