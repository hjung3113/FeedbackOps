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

import {
  Button,
  Callout,
  Checkbox,
  DetailPanelSectionNav,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FieldRow,
  Input,
  Label,
  ManagedSystemPicker,
  ManagedSystemPill,
  OutlineBadge,
  PageShell,
  type PanelSection,
  PanelSectionTitle,
  PanelTitleBlock,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type PickerOption,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  UserChip,
} from '@fops/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Filter, Layers, Plus, Settings, Shield } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import { scopeMark } from '../../../features/admin/lib/scopeMark.js';
import { PermissionGate } from '../../../features/admin/permissions/permission-gate.js';
import {
  type AnalyticsAreaDto,
  ApiError,
  type ManagedSystemDto,
  type RegisterAnalyticsAreaBody,
  type ResolveActorsResponse,
  type UpdateAnalyticsAreaBody,
  archiveAnalyticsArea,
  fetchAnalyticsAreas,
  fetchManagedSystems,
  registerAnalyticsArea,
  resolveActors,
  updateAnalyticsArea,
} from '../../../lib/api';

export const Route = createFileRoute('/_authed/admin/analytics-areas')({
  component: AnalyticsAreasAdminPage,
});

function envelopeMessage(err: unknown): string {
  if (err instanceof ApiError) return `${err.envelope.code}: ${err.envelope.message}`;
  if (err instanceof Error) return err.message;
  return 'unknown error';
}

const AA_KEY = ['analytics-areas'] as const;
const SUBTITLE =
  'Analytics Area 는 Managed System 하위의 분류 라벨입니다. 권한 경계가 아니라 dashboard·triage 의 필터 차원입니다.';
const GUARDRAIL_TITLE = 'Analytics Area 는 MVP 권한 경계가 아닙니다';
const GUARDRAIL_BODY =
  'AA 는 Managed System 안에서의 분류·집계 단위로만 사용됩니다. AA 별 권한 분기는 MVP 범위 밖이며, scope 결정은 Managed System 만으로 이루어집니다.';

export function AnalyticsAreasAdminPage() {
  const [registerCtx, setRegisterCtx] = useState<{ open: boolean; msId: string | null }>({
    open: false,
    msId: null,
  });
  const [managedSystemId, setManagedSystemId] = useState<string | undefined>();
  const [includeArchived, setIncludeArchived] = useState(false);
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
              onIncludeArchivedChange={setIncludeArchived}
              onManagedSystemIdChange={setManagedSystemId}
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
          onClearFilters={() => {
            setManagedSystemId(undefined);
            setIncludeArchived(false);
          }}
          registerCtx={registerCtx}
          setRegisterCtx={setRegisterCtx}
        />
      </PermissionGate>
    </PageShell>
  );
}

function groupByMs(
  items: AnalyticsAreaDto[],
  includeArchived: boolean,
): Map<string, AnalyticsAreaDto[]> {
  const out = new Map<string, AnalyticsAreaDto[]>();
  for (const a of items) {
    if (!includeArchived && a.archived_at !== null) continue;
    const arr = out.get(a.managed_system_id) ?? [];
    arr.push(a);
    out.set(a.managed_system_id, arr);
  }
  return out;
}

export function AnalyticsAreasBody({
  includeArchived,
  managedSystemId,
  onClearFilters,
  registerCtx,
  setRegisterCtx,
}: {
  includeArchived: boolean;
  managedSystemId: string | undefined;
  onClearFilters: () => void;
  registerCtx: { open: boolean; msId: string | null };
  setRegisterCtx: (v: { open: boolean; msId: string | null }) => void;
}) {
  const qc = useQueryClient();
  const [detail, setDetail] = useState<AnalyticsAreaDto | null>(null);
  const [editTarget, setEditTarget] = useState<AnalyticsAreaDto | null>(null);

  const msQuery = useQuery({
    queryKey: ['managed-systems', { includeArchived }] as const,
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived, signal }),
    retry: false,
  });
  const aaQuery = useQuery({
    queryKey: [...AA_KEY, { managedSystemId, includeArchived }] as const,
    queryFn: ({ signal }) =>
      fetchAnalyticsAreas({
        ...(managedSystemId ? { managedSystemId } : {}),
        includeArchived,
        signal,
      }),
    retry: false,
  });

  const systems = useMemo(() => msQuery.data?.items ?? [], [msQuery.data]);
  const renderedSystems = useMemo(
    () => (managedSystemId ? systems.filter((system) => system.id === managedSystemId) : systems),
    [managedSystemId, systems],
  );
  const areas = useMemo(() => aaQuery.data?.items ?? [], [aaQuery.data]);
  const areasByMs = useMemo(
    () => groupByMs(areas, includeArchived),
    [areas, includeArchived],
  );
  const renderedAreaCount = useMemo(
    () =>
      renderedSystems.reduce(
        (count, system) => count + (areasByMs.get(system.id)?.length ?? 0),
        0,
      ),
    [areasByMs, renderedSystems],
  );
  const msById = useMemo(
    () => new Map<string, ManagedSystemDto>(systems.map((m) => [m.id, m])),
    [systems],
  );

  const teamIds = useMemo(
    () => [...new Set(areas.map((a) => a.owner_team_id).filter((v): v is string => !!v))],
    [areas],
  );
  const resolveQuery = useQuery({
    queryKey: ['actors-resolve', 'aa-teams', teamIds] as const,
    queryFn: ({ signal }) => resolveActors({ teamIds }, signal),
    enabled: teamIds.length > 0,
    retry: false,
  });

  const msOptions: PickerOption[] = systems
    .filter((m) => includeArchived || m.archived_at === null)
    .map((m) => ({ id: m.id, label: m.name }));

  async function invalidate() {
    await qc.invalidateQueries({ queryKey: AA_KEY });
  }

  return (
    <section className="space-y-6" data-testid="analytics-areas-catalog">
      <div data-testid="aa-guardrail-callout">
        <Callout tone="blue" icon={<Shield className="h-4 w-4" />} title={GUARDRAIL_TITLE}>
          {GUARDRAIL_BODY}
        </Callout>
      </div>

      <div>
        <div className="mb-3.5 flex items-center justify-between">
          <PanelSectionTitle className="mb-0">Catalog</PanelSectionTitle>
          <span className="text-xs text-text-muted">
            {renderedAreaCount} {renderedAreaCount === 1 ? 'area' : 'areas'} ·{' '}
            {renderedSystems.length} {renderedSystems.length === 1 ? 'system' : 'systems'}
          </span>
        </div>

        {aaQuery.isPending || msQuery.isPending ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : aaQuery.isError ? (
          <p className="text-sm text-accent-danger" data-testid="aa-list-error">
            Error: {envelopeMessage(aaQuery.error)}
          </p>
        ) : systems.length === 0 ? (
          <div
            className="rounded-md border border-border-subtle bg-surface-card p-8 text-center text-sm text-text-muted"
            data-testid="aa-empty-state"
          >
            등록된 Managed System 이 없습니다.
          </div>
        ) : renderedSystems.length === 0 ? (
          <div
            className="rounded-md border border-border-subtle bg-surface-card p-8 text-center text-sm text-text-muted"
            data-testid="aa-filter-empty-state"
          >
            <p>필터에 해당하는 Managed System이 없습니다.</p>
            <Button
              variant="subtle"
              size="sm"
              className="mt-3"
              onClick={onClearFilters}
              data-testid="aa-clear-filters"
            >
              필터 해제
            </Button>
          </div>
        ) : (
          <div data-testid="aa-grouped-list" className="space-y-4">
            {renderedSystems.map((m) => (
              <GroupCard
                key={m.id}
                ms={m}
                areas={areasByMs.get(m.id) ?? []}
                resolved={resolveQuery.data}
                onRowClick={setDetail}
                onAddArea={() => setRegisterCtx({ open: true, msId: m.id })}
              />
            ))}
          </div>
        )}
      </div>

      <RegisterDialog
        ctx={registerCtx}
        msOptions={msOptions}
        onOpenChange={(open) => setRegisterCtx({ open, msId: open ? registerCtx.msId : null })}
        onSaved={async () => {
          setRegisterCtx({ open: false, msId: null });
          await invalidate();
        }}
      />

      <AnalyticsAreaSlideOver
        area={detail}
        ms={detail ? (msById.get(detail.managed_system_id) ?? null) : null}
        resolved={resolveQuery.data}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
        onEdit={(area) => {
          setDetail(null);
          setEditTarget(area);
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

function AnalyticsAreasFilter({
  includeArchived,
  managedSystemId,
  onIncludeArchivedChange,
  onManagedSystemIdChange,
}: {
  includeArchived: boolean;
  managedSystemId: string | undefined;
  onIncludeArchivedChange: (value: boolean) => void;
  onManagedSystemIdChange: (value: string | undefined) => void;
}) {
  const systemsQuery = useQuery({
    queryKey: ['managed-systems', { includeArchived }] as const,
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived, signal }),
    retry: false,
  });
  const systems = systemsQuery.data?.items ?? [];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="subtle" size="sm" data-testid="aa-filter-button">
          <Filter className="h-4 w-4" />
          Filter
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="aa-filter-managed-system">Managed System</Label>
          <Select
            value={managedSystemId ?? 'all'}
            onValueChange={(value) => onManagedSystemIdChange(value === 'all' ? undefined : value)}
          >
            <SelectTrigger id="aa-filter-managed-system" data-testid="aa-filter-managed-system">
              <SelectValue placeholder="전체" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              {systems.map((system) => (
                <SelectItem key={system.id} value={system.id}>
                  {system.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm text-text-primary" htmlFor="aa-filter-include-archived">
          <Checkbox
            id="aa-filter-include-archived"
            checked={includeArchived}
            onCheckedChange={(checked) => onIncludeArchivedChange(checked === true)}
            data-testid="aa-filter-include-archived"
          />
          Archived 포함
        </label>
      </PopoverContent>
    </Popover>
  );
}

function teamName(
  area: AnalyticsAreaDto,
  resolved: ResolveActorsResponse | undefined,
): string | null {
  if (!area.owner_team_id) return null;
  const t = resolved?.teams.find((x) => x.id === area.owner_team_id);
  return t ? t.name : null;
}

function GroupCard({
  ms,
  areas,
  resolved,
  onRowClick,
  onAddArea,
}: {
  ms: ManagedSystemDto;
  areas: AnalyticsAreaDto[];
  resolved: ResolveActorsResponse | undefined;
  onRowClick: (a: AnalyticsAreaDto) => void;
  onAddArea: () => void;
}) {
  const mark = scopeMark(ms.slug, ms.name);
  return (
    <div
      data-testid={`aa-group-${ms.id}`}
      className="overflow-hidden rounded-md border border-border-subtle bg-surface-card"
    >
      <div className="flex items-center gap-2.5 border-b border-border-subtle px-4 py-2.5">
        <div
          className="flex items-center justify-center rounded-md text-[10px] font-semibold text-white"
          style={{ width: 22, height: 22, background: mark.color }}
          aria-hidden="true"
        >
          {mark.label}
        </div>
        <span className="text-sm font-semibold text-text-primary">{ms.name}</span>
        {ms.archived_at !== null ? <OutlineBadge>Archived</OutlineBadge> : null}
        <span className="text-xs text-text-muted">
          · {areas.length} {areas.length === 1 ? 'area' : 'areas'}
        </span>
        <div className="flex-1" />
        <Button
          variant="subtle"
          size="sm"
          onClick={onAddArea}
          data-testid={`aa-add-area-${ms.slug}`}
        >
          <Plus className="h-3 w-3" />
          Add area
        </Button>
      </div>

      {areas.length === 0 ? (
        <div className="px-4 py-4 text-center text-xs text-text-muted">
          등록된 Analytics Area 가 없습니다.
        </div>
      ) : (
        areas.map((a, i) => {
          const lead = teamName(a, resolved);
          return (
            // biome-ignore lint/a11y/useKeyWithClickEvents: row is a real <div> with a nested <button> affordance; click anywhere opens the detail.
            <div
              key={a.id}
              role="button"
              tabIndex={0}
              data-testid={`aa-row-${a.slug}`}
              onClick={() => onRowClick(a)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onRowClick(a);
              }}
              className={`grid w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-surface-canvas${
                i < areas.length - 1 ? ' border-b border-border-subtle' : ''
              }`}
              style={{ gridTemplateColumns: '1fr 1.2fr 0.8fr 100px' }}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Layers className="h-3 w-3 shrink-0 text-text-muted" />
                <span className="truncate font-medium text-text-primary">{a.name}</span>
                {a.archived_at !== null ? <OutlineBadge>Archived</OutlineBadge> : null}
              </span>
              <span className="truncate font-mono text-xs text-text-muted">
                analytics-area/{a.slug}
              </span>
              <span className="truncate text-xs text-text-muted">
                Lead: <span className="text-text-secondary">{lead ?? '—'}</span>
              </span>
              <div className="text-right">
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRowClick(a);
                  }}
                  data-testid={`aa-detail-${a.slug}`}
                >
                  Detail
                </Button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ============================================================
// AnalyticsAreaSlideOver — 460px read-only AA detail drawer.
// Overview / Guardrail / Definition / Workload / Findings / Used by.
// Built with the @fops/ui sheet (Radix dialog) wrapper; right side, 460px.
// ============================================================
function AnalyticsAreaSlideOver({
  area,
  ms,
  resolved,
  onOpenChange,
  onEdit,
}: {
  area: AnalyticsAreaDto | null;
  ms: ManagedSystemDto | null;
  resolved: ResolveActorsResponse | undefined;
  onOpenChange: (open: boolean) => void;
  onEdit: (area: AnalyticsAreaDto) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  if (!area) return null;

  const mark = ms ? scopeMark(ms.slug, ms.name) : null;
  const lead = teamName(area, resolved);
  const created = area.created_at.slice(0, 10);

  // Workload + Findings are Slice 4/5 surfaces (not built). Shells render with
  // "—" placeholders; no counts available from the DTO (locked decision #88).
  const sections: PanelSection[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'guardrail', label: 'Guardrail' },
    { id: 'definition', label: 'Definition' },
    { id: 'workload', label: 'Workload' },
    { id: 'findings', label: 'Findings' },
    { id: 'used-by', label: 'Used by' },
  ];

  return (
    <Sheet open={true} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-[460px] flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        data-testid="aa-slide-over"
      >
        <SheetTitle className="sr-only">{area.name}</SheetTitle>
        <SheetDescription className="sr-only">
          Analytics Area detail — analytics-area/{area.slug}
        </SheetDescription>
        <div className="flex items-center gap-2 border-b border-border-subtle px-6 py-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-primary/15 px-2 py-0.5 text-xs font-medium text-accent-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-primary" />
            Analytics Area
          </span>
          <span className="font-mono text-xs text-text-muted">analytics-area/{area.slug}</span>
        </div>

        <DetailPanelSectionNav sections={sections} scrollRef={scrollRef} />

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div data-anchor="overview">
            <PanelTitleBlock
              title={area.name}
              badges={
                <>
                  <ManagedSystemPill
                    name={ms?.name ?? area.managed_system_id}
                    {...(mark ? { mark: mark.color } : {})}
                  />
                  <OutlineBadge>Filter dimension</OutlineBadge>
                </>
              }
            />
          </div>

          <div data-anchor="guardrail" className="px-4 py-3">
            <Callout
              tone="blue"
              icon={<Shield className="h-4 w-4" />}
              title="Not a permission boundary"
            >
              AA 는 권한 경계가 아닌 분류·집계 단위입니다. Triage filter, dashboard tab, survey
              targeting 같은 surface 에서만 사용되며 backend permission check 에는 영향을 주지
              않습니다.
            </Callout>
          </div>

          <div data-anchor="definition" className="px-4 py-3">
            <PanelSectionTitle>Definition</PanelSectionTitle>
            <FieldRow label="Managed System" className="px-0">
              <span className="flex items-center gap-1.5">
                {mark && (
                  <span
                    className="flex items-center justify-center rounded text-[10px] font-semibold text-white"
                    style={{ width: 18, height: 18, background: mark.color }}
                    aria-hidden="true"
                  >
                    {mark.label}
                  </span>
                )}
                <span>{ms?.name ?? area.managed_system_id}</span>
              </span>
            </FieldRow>
            <FieldRow label="Slug" className="px-0">
              <span className="font-mono text-xs">{area.slug}</span>
            </FieldRow>
            <FieldRow label="Lead" className="px-0">
              {lead ? (
                <UserChip user={{ display_name: lead }} size="sm" />
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </FieldRow>
            <FieldRow label="Created" className="px-0">
              {created}
            </FieldRow>
            <FieldRow label="Default visibility" className="px-0">
              <span className="inline-flex items-center gap-1 rounded-full border border-border-subtle px-2 py-0.5 text-xs text-text-secondary">
                <Shield className="h-2.5 w-2.5" />
                Internal · MS-scoped
              </span>
            </FieldRow>
          </div>

          <div data-anchor="workload" className="px-4 py-3">
            <PanelSectionTitle>Workload signal</PanelSectionTitle>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-1 rounded-md bg-surface-canvas p-3">
                <span className="text-xs text-text-muted">Active findings</span>
                <span className="text-lg font-semibold text-text-primary">—</span>
                <span className="text-xs text-text-muted">in this analytics area</span>
              </div>
              <div className="flex flex-col gap-1 rounded-md bg-surface-canvas p-3">
                <span className="text-xs text-text-muted">Evidence highlights</span>
                <span className="text-lg font-semibold text-text-primary">—</span>
                <span className="text-xs text-text-muted">tagged to this AA</span>
              </div>
            </div>
            <p className="mt-2 text-xs text-text-muted" data-testid="aa-workload-defer">
              Findings · Evidence 집계는 Slice 4/5 surface 가 들어온 뒤 연결됩니다.
            </p>
          </div>

          <div data-anchor="findings" className="px-4 py-3">
            <PanelSectionTitle>Recent findings</PanelSectionTitle>
            <div
              className="rounded-md border border-border-subtle bg-surface-card p-4 text-center text-xs text-text-muted"
              data-testid="aa-findings-defer"
            >
              Findings 목록은 Slice 4/5 에서 연결됩니다.
            </div>
          </div>

          <div data-anchor="used-by" className="px-4 py-3">
            <PanelSectionTitle>Used by</PanelSectionTitle>
            <div className="flex flex-col gap-1.5">
              {[
                { label: 'VOC Triage', meta: 'filter dimension' },
                { label: 'Findings list', meta: 'filter + grouping' },
                { label: 'Survey targeting', meta: 'segment definition' },
              ].map((u) => (
                <div
                  key={u.label}
                  className="flex items-center gap-2 rounded-md bg-surface-canvas px-2.5 py-2"
                >
                  <Layers className="h-3 w-3 text-text-muted" />
                  <span className="text-sm text-text-primary">{u.label}</span>
                  <span className="text-xs text-text-muted">· {u.meta}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-border-subtle p-3">
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => onEdit(area)}
            data-testid="aa-edit-button"
          >
            <Settings className="h-3 w-3" />
            Edit area
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function RegisterDialog({
  ctx,
  msOptions,
  onOpenChange,
  onSaved,
}: {
  ctx: { open: boolean; msId: string | null };
  msOptions: PickerOption[];
  onOpenChange: (v: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  return (
    <Dialog open={ctx.open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="aa-register-dialog">
        {ctx.open && (
          <RegisterForm
            key={ctx.msId ?? 'none'}
            msOptions={msOptions}
            initialMsId={ctx.msId}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RegisterForm({
  msOptions,
  initialMsId,
  onSaved,
}: {
  msOptions: PickerOption[];
  initialMsId: string | null;
  onSaved: () => Promise<void>;
}) {
  const [msId, setMsId] = useState<string | null>(initialMsId);
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<'managedSystem' | 'slug' | 'name', string>>
  >({});
  const managedSystemRef = useRef<HTMLFieldSetElement>(null);
  const slugRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: async (body: RegisterAnalyticsAreaBody) => registerAnalyticsArea(body),
    onSuccess: async () => {
      setError(null);
      await onSaved();
    },
    onError: (err) => setError(envelopeMessage(err)),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>New area</DialogTitle>
        <DialogDescription>
          Managed System 하위에 새 Analytics Area 를 등록합니다.
        </DialogDescription>
      </DialogHeader>
      <form
        data-testid="create-analytics-area-form"
        className="space-y-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          const nextErrors: Partial<
            Record<'managedSystem' | 'slug' | 'name', string>
          > = {};
          if (!msId) nextErrors.managedSystem = 'Managed System is required.';
          if (!slug.trim()) nextErrors.slug = 'Slug is required.';
          if (!name.trim()) nextErrors.name = 'Name is required.';
          if (Object.keys(nextErrors).length > 0) {
            setFieldErrors(nextErrors);
            if (nextErrors.managedSystem) {
              managedSystemRef.current
                ?.querySelector<HTMLButtonElement>('button')
                ?.focus();
            }
            else if (nextErrors.slug) slugRef.current?.focus();
            else nameRef.current?.focus();
            return;
          }
          setFieldErrors({});
          // Unreachable: the block above returns whenever msId is unset. Kept
          // so the narrowing is local instead of relying on nextErrors.
          if (!msId) return;
          mutation.mutate({ managed_system_id: msId, slug, name });
        }}
      >
        {/* fieldset, not a div with role="group" — biome's useSemanticElements
            rejects the ARIA-only form and the native element carries the same
            grouping for assistive tech. */}
        <fieldset
          className="space-y-1"
          ref={managedSystemRef}
          aria-labelledby="aa-create-managed-system-label"
          aria-describedby={
            fieldErrors.managedSystem
              ? 'aa-create-managed-system-error'
              : undefined
          }
          aria-required="true"
        >
          <Label
            id="aa-create-managed-system-label"
            className="text-text-secondary"
          >
            Managed System <span className="text-accent-danger">· 필수</span>
          </Label>
          <ManagedSystemPicker
            options={msOptions}
            value={msId}
            onChange={setMsId}
            testId="create-ms-picker"
          />
          {fieldErrors.managedSystem && (
            <p
              id="aa-create-managed-system-error"
              className="text-sm text-accent-danger"
            >
              {fieldErrors.managedSystem}
            </p>
          )}
        </fieldset>
        <div className="space-y-1">
          <Label htmlFor="aa-create-slug" className="text-text-secondary">
            Slug <span className="text-accent-danger">· 필수</span>
          </Label>
          <Input
            id="aa-create-slug"
            ref={slugRef}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            aria-describedby={fieldErrors.slug ? 'aa-create-slug-error' : undefined}
            aria-invalid={Boolean(fieldErrors.slug)}
            aria-required="true"
            data-testid="create-aa-slug"
          />
          {fieldErrors.slug && (
            <p id="aa-create-slug-error" className="text-sm text-accent-danger">
              {fieldErrors.slug}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor="aa-create-name" className="text-text-secondary">
            Name <span className="text-accent-danger">· 필수</span>
          </Label>
          <Input
            id="aa-create-name"
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-describedby={fieldErrors.name ? 'aa-create-name-error' : undefined}
            aria-invalid={Boolean(fieldErrors.name)}
            aria-required="true"
            data-testid="create-aa-name"
          />
          {fieldErrors.name && (
            <p id="aa-create-name-error" className="text-sm text-accent-danger">
              {fieldErrors.name}
            </p>
          )}
        </div>
        {error && (
          <p data-testid="create-aa-error" className="text-sm text-accent-danger">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="submit" disabled={mutation.isPending} data-testid="create-aa-submit">
            Register
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function EditDialog({
  target,
  onOpenChange,
  onSaved,
}: {
  target: AnalyticsAreaDto | null;
  onOpenChange: (v: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent data-testid="aa-edit-dialog">
        {target && <EditForm key={target.id} target={target} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({
  target,
  onSaved,
}: {
  target: AnalyticsAreaDto;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(target.name);
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const body: UpdateAnalyticsAreaBody = {};
      if (name !== target.name) body.name = name;
      return updateAnalyticsArea(target.id, body);
    },
    onSuccess: async () => {
      setError(null);
      await onSaved();
    },
    onError: (err) => setError(envelopeMessage(err)),
  });

  const archiveMutation = useMutation({
    mutationFn: async () => archiveAnalyticsArea(target.id),
    onSuccess: async () => {
      setError(null);
      await onSaved();
    },
    onError: (err) => setError(envelopeMessage(err)),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit {target.name}</DialogTitle>
        <DialogDescription>
          <span className="font-mono text-xs">analytics-area/{target.slug}</span>
        </DialogDescription>
      </DialogHeader>
      <form
        data-testid={`edit-analytics-area-form-${target.slug}`}
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          updateMutation.mutate();
        }}
      >
        <div className="space-y-1">
          <Label htmlFor={`aa-edit-name-${target.slug}`} className="text-text-secondary">
            Name
          </Label>
          <Input
            id={`aa-edit-name-${target.slug}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid={`aa-name-input-${target.slug}`}
          />
        </div>
        {error && (
          <p data-testid={`aa-row-error-${target.slug}`} className="text-sm text-accent-danger">
            {error}
          </p>
        )}
        <DialogFooter className="justify-between">
          {target.archived_at === null ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => archiveMutation.mutate()}
              disabled={archiveMutation.isPending}
              data-testid={`aa-archive-${target.slug}`}
            >
              Archive
            </Button>
          ) : (
            <span className="text-sm text-text-muted">이미 보관됨</span>
          )}
          <Button
            type="submit"
            disabled={updateMutation.isPending}
            data-testid={`aa-save-${target.slug}`}
          >
            Save
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
