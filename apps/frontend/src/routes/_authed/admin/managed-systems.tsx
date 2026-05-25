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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  OutlineBadge,
  PageShell,
  UserChip,
} from '@fops/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { ArrowRight, Filter, Plus, Shield } from 'lucide-react';
import { useMemo, useState } from 'react';

import { scopeMark } from '../../../features/admin/lib/scopeMark.js';
import { PermissionGate } from '../../../features/admin/permissions/permission-gate.js';
import {
  type AnalyticsAreaDto,
  ApiError,
  type ManagedSystemDto,
  type RegisterManagedSystemBody,
  type ResolveActorsResponse,
  type UpdateManagedSystemBody,
  archiveManagedSystem,
  fetchAnalyticsAreas,
  fetchManagedSystems,
  fetchPermissionRequestsAll,
  registerManagedSystem,
  resolveActors,
  updateManagedSystem,
} from '../../../lib/api';

export const Route = createFileRoute('/_authed/admin/managed-systems')({
  component: ManagedSystemsAdminPage,
});

function envelopeMessage(err: unknown): string {
  if (err instanceof ApiError) return `${err.envelope.code}: ${err.envelope.message}`;
  if (err instanceof Error) return err.message;
  return 'unknown error';
}

const MANAGED_SYSTEMS_KEY = ['managed-systems'] as const;
const SUBTITLE =
  'Managed System 은 MVP 의 권한·집계 단위입니다. Project 가 아닙니다. 각 시스템의 default owner, AA 매핑, 활성 상태를 관리합니다.';

export function ManagedSystemsAdminPage() {
  const [registerOpen, setRegisterOpen] = useState(false);
  return (
    <PageShell
      header={{
        title: 'Managed systems',
        subtitle: SUBTITLE,
        actions: (
          <PermissionGate capability="workspace.admin" fallback={null} loading={null}>
            <Button variant="subtle" size="sm" data-testid="ms-filter-button">
              <Filter className="h-4 w-4" />
              Filter
            </Button>
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
      <div className="mx-auto max-w-5xl p-8">
        <PermissionGate capability="workspace.admin">
          <ManagedSystemsBody registerOpen={registerOpen} setRegisterOpen={setRegisterOpen} />
        </PermissionGate>
      </div>
    </PageShell>
  );
}

function groupAreasByMs(items: AnalyticsAreaDto[]): Map<string, AnalyticsAreaDto[]> {
  const out = new Map<string, AnalyticsAreaDto[]>();
  for (const a of items) {
    if (a.archived_at !== null) continue;
    const arr = out.get(a.managed_system_id) ?? [];
    arr.push(a);
    out.set(a.managed_system_id, arr);
  }
  return out;
}

export function ManagedSystemsBody({
  registerOpen,
  setRegisterOpen,
}: {
  registerOpen: boolean;
  setRegisterOpen: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [editTarget, setEditTarget] = useState<ManagedSystemDto | null>(null);

  const listQuery = useQuery({
    queryKey: [...MANAGED_SYSTEMS_KEY, { includeArchived: false }] as const,
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived: false, signal }),
    retry: false,
  });
  const areasQuery = useQuery({
    queryKey: ['analytics-areas', 'all'] as const,
    queryFn: ({ signal }) => fetchAnalyticsAreas({ signal }),
    retry: false,
  });
  const requestsQuery = useQuery({
    queryKey: ['permission-requests', 'all'] as const,
    queryFn: ({ signal }) => fetchPermissionRequestsAll(signal),
    retry: false,
  });

  const systems = useMemo(() => listQuery.data?.items ?? [], [listQuery.data]);
  const areas = useMemo(() => areasQuery.data?.items ?? [], [areasQuery.data]);
  const areasByMs = useMemo(() => groupAreasByMs(areas), [areas]);
  const activeAreaCount = areas.filter((a) => a.archived_at === null).length;

  const ownerActorIds = useMemo(
    () => [
      ...new Set(systems.map((m) => m.default_owner_actor_id).filter((v): v is string => !!v)),
    ],
    [systems],
  );
  const ownerTeamIds = useMemo(
    () => [...new Set(systems.map((m) => m.default_owner_team_id).filter((v): v is string => !!v))],
    [systems],
  );
  const resolveQuery = useQuery({
    queryKey: ['actors-resolve', ownerActorIds, ownerTeamIds] as const,
    queryFn: ({ signal }) =>
      resolveActors({ actorIds: ownerActorIds, teamIds: ownerTeamIds }, signal),
    enabled: ownerActorIds.length > 0 || ownerTeamIds.length > 0,
    retry: false,
  });

  async function invalidate() {
    await qc.invalidateQueries({ queryKey: MANAGED_SYSTEMS_KEY });
  }

  return (
    <section className="space-y-8">
      {/* ── Registry ──────────────────────────────────────────────── */}
      <div>
        <div className="mb-3.5 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Registry
          </h3>
          <span className="text-xs text-text-muted">
            {systems.length} systems · {activeAreaCount} analytics areas
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
                resolved={resolveQuery.data}
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
              {requestsQuery.data?.count ?? 0} requests awaiting decision
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
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        onSaved={async () => {
          setRegisterOpen(false);
          await invalidate();
        }}
      />
      <EditDialog
        target={editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        onSaved={async () => {
          setEditTarget(null);
          await invalidate();
        }}
      />
    </section>
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
        <div className="truncate text-sm font-medium text-text-primary">{row.name}</div>
        <div className="truncate font-mono text-xs text-text-muted">managed-system/{row.slug}</div>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-text-muted">Default owner</span>
        <UserChip user={owner} size="sm" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {areas.map((a) => (
          <OutlineBadge key={a.id}>{a.name}</OutlineBadge>
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

function RegisterDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [externalKey, setExternalKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (body: RegisterManagedSystemBody) => registerManagedSystem(body),
    onSuccess: async () => {
      setSlug('');
      setName('');
      setExternalKey('');
      setError(null);
      await onSaved();
    },
    onError: (err) => setError(envelopeMessage(err)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="ms-register-dialog">
        <DialogHeader>
          <DialogTitle>Register system</DialogTitle>
          <DialogDescription>새 Managed System 을 레지스트리에 추가합니다.</DialogDescription>
        </DialogHeader>
        <form
          data-testid="create-managed-system-form"
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            const body: RegisterManagedSystemBody = { slug, name };
            if (externalKey.length > 0) body.external_key = externalKey;
            mutation.mutate(body);
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="ms-create-slug" className="text-text-secondary">
              Slug
            </Label>
            <Input
              id="ms-create-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
              data-testid="create-slug"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ms-create-name" className="text-text-secondary">
              Name
            </Label>
            <Input
              id="ms-create-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              data-testid="create-name"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ms-create-external-key" className="text-text-secondary">
              External key (optional)
            </Label>
            <Input
              id="ms-create-external-key"
              value={externalKey}
              onChange={(e) => setExternalKey(e.target.value)}
              data-testid="create-external-key"
            />
          </div>
          {error && (
            <p data-testid="create-error" className="text-sm text-accent-danger">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              data-testid="create-cancel"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending} data-testid="create-submit">
              Register
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  target,
  onOpenChange,
  onSaved,
}: {
  target: ManagedSystemDto | null;
  onOpenChange: (v: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent data-testid="ms-edit-dialog">
        {target && <EditForm key={target.id} target={target} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({
  target,
  onSaved,
}: {
  target: ManagedSystemDto;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(target.name);
  const [externalKey, setExternalKey] = useState(target.external_key ?? '');
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const body: UpdateManagedSystemBody = {};
      if (name !== target.name) body.name = name;
      const nextKey = externalKey.length > 0 ? externalKey : null;
      if (nextKey !== target.external_key) body.external_key = nextKey;
      return updateManagedSystem(target.id, body);
    },
    onSuccess: async () => {
      setError(null);
      await onSaved();
    },
    onError: (err) => setError(envelopeMessage(err)),
  });

  const archiveMutation = useMutation({
    mutationFn: async () => archiveManagedSystem(target.id),
    onSuccess: async () => {
      setError(null);
      await onSaved();
    },
    onError: (err) => setError(envelopeMessage(err)),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Configure {target.name}</DialogTitle>
        <DialogDescription>
          <span className="font-mono text-xs">managed-system/{target.slug}</span>
        </DialogDescription>
      </DialogHeader>
      <form
        data-testid={`edit-managed-system-form-${target.slug}`}
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          updateMutation.mutate();
        }}
      >
        <div className="space-y-1">
          <Label htmlFor={`ms-edit-name-${target.slug}`} className="text-text-secondary">
            Name
          </Label>
          <Input
            id={`ms-edit-name-${target.slug}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid={`name-input-${target.slug}`}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`ms-edit-key-${target.slug}`} className="text-text-secondary">
            External key
          </Label>
          <Input
            id={`ms-edit-key-${target.slug}`}
            value={externalKey}
            onChange={(e) => setExternalKey(e.target.value)}
            data-testid={`external-key-input-${target.slug}`}
          />
        </div>
        {error && (
          <p data-testid={`row-error-${target.slug}`} className="text-sm text-accent-danger">
            {error}
          </p>
        )}
        <DialogFooter className="justify-between">
          <Button
            type="button"
            variant="destructive"
            onClick={() => archiveMutation.mutate()}
            disabled={archiveMutation.isPending}
            data-testid={`archive-${target.slug}`}
          >
            Archive
          </Button>
          <Button
            type="submit"
            disabled={updateMutation.isPending}
            data-testid={`save-${target.slug}`}
          >
            Save
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
