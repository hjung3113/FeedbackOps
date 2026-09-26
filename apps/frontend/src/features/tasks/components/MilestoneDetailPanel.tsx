import { createMilestone, getMilestone, updateMilestone } from '@/lib/api/milestones';
import { listTasks } from '@/lib/api/tasks';
import { ApiError } from '@/lib/api/types';
import type {
  CreateMilestoneRequest,
  MilestoneDetailDto,
  MilestoneDto,
  MilestoneStatusFilter,
  TaskDto,
} from '@fops/shared';
import {
  Button,
  DetailPanelHeader,
  DetailPanelHeaderActions,
  DetailPanelSectionNav,
  DirtyConfirmation,
  FieldRow,
  Input,
  InternalTaskBadge,
  NestedTextBlock,
  type PanelSection,
  PanelTitleBlock,
  PermissionBlockedPanel,
  SeverityIndicator,
  Textarea,
  UserAvatar,
} from '@fops/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, Pencil } from 'lucide-react';
import * as React from 'react';
import {
  MilestoneManagedSystemPill,
  MilestoneOutlineBadge,
  MilestoneOwnerChip,
  MilestonePanelSectionTitle,
} from './MilestoneIdentity';
import { MilestoneStatusBadge } from './MilestoneStatusBadge';

// #514 B2d — Milestone detail panel mirroring MilestoneDetailPanel in
// docs/design-prototype/screen-milestones.jsx, mounted in the existing
// ListShell detail slot (never a new shell).
// Timeline section is deliberately omitted: Timeline is Slice C (TaskGantt).
// Tasks is B2d-tasks — the child rows read GET /tasks?milestone_id=, with the
// G-columns call (ADR-0050 choice a) in MilestoneTaskRow below.
// B2d fixup — the shared header and close action stay mounted on every detail
// read state (review finding 2), the why keeps the prototype's NestedTextBlock
// nesting (finding 1), and a linked source Finding offers Open finding
// navigation to its own route (finding 3). A terminal query error wins over
// data React Query retains after a failed refetch (R2-1).

// Nav order mirrors the prototype (Overview, Timeline, Tasks, Evidence,
// Activity); Timeline stays Slice C. MilestoneDetailContent appends the
// child-row count to the Tasks entry once the milestone query resolves.
const SECTIONS: PanelSection[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'activity', label: 'Activity' },
];

const PRIORITY_SEVERITY: Record<TaskDto['priority'], 'low' | 'medium' | 'high' | 'critical'> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  urgent: 'critical',
};

// B2e-status (ADR-0050) — the persisted set is exactly these four values and
// PATCH is free among them. Labels verbatim from MILESTONE_STATUS_META in
// screen-milestones.jsx.
const STATUS_OPTIONS: ReadonlyArray<{ value: MilestoneStatusFilter; label: string }> = [
  { value: 'planning', label: 'Planning' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'released', label: 'Released' },
];

const selectClassName =
  'w-48 rounded border border-border-subtle bg-surface-detail px-2 py-1.5 text-sm text-text-primary';

const milestonePropertyFieldClassName =
  'grid grid-cols-[120px_1fr] items-start gap-3 px-0 text-[13px] [&>div]:text-left';

// MilestoneTaskRow (prototype screen-milestones.jsx:214-238) — read-only
// child row: priority indicator, display id, title, internal status, stamps,
// assignee chip. No Add task action exists in #514.
function MilestoneTaskRow({
  task,
  assigneeName,
}: {
  task: TaskDto;
  assigneeName?: string | undefined;
}) {
  return (
    // G-columns (ADR-0050 choice a, design §7 item 12): the prototype's estimate slot renders the Task due_date; no estimate field exists.
    // Nested card geometry per prototype .card-nested: radius 6, borderless, 10/12 padding.
    <div className="flex items-center gap-2.5 rounded-md bg-surface-canvas px-3 py-2.5">
      <SeverityIndicator severity={PRIORITY_SEVERITY[task.priority]} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-text-muted">{task.display_id}</span>
          <span className="truncate text-sm font-medium text-text-primary">{task.title}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <InternalTaskBadge status={task.status} />
          {task.due_date !== null && <span>· {task.due_date}</span>}
          <span>· updated {task.updated_at.slice(0, 10)}</span>
        </div>
      </div>
      {assigneeName !== undefined ? (
        <UserAvatar user={{ display_name: assigneeName }} size="sm" />
      ) : task.assignee_actor_id === null ? (
        <span className="rounded border border-border-subtle px-1.5 py-0.5">Unassigned</span>
      ) : null}
    </div>
  );
}

export interface MilestoneDetailPanelProps {
  milestoneId: string;
  onClose: () => void;
  actorNamesById: ReadonlyMap<string, string>;
  managedSystemNamesById: ReadonlyMap<string, string>;
  analyticsAreaNamesById: ReadonlyMap<string, string>;
  /** R3 — reports whether a title draft is unsaved, so the route can run the
      discard confirmation before a record switch, New milestone, or a URL
      param change replaces the panel. */
  onTitleDirtyChange?: (dirty: boolean) => void;
}

export function MilestoneDetailPanel({
  milestoneId,
  onClose,
  actorNamesById,
  managedSystemNamesById,
  analyticsAreaNamesById,
  onTitleDirtyChange,
}: MilestoneDetailPanelProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const milestoneQuery = useQuery({
    queryKey: ['milestone', milestoneId] as const,
    queryFn: ({ signal }) => getMilestone(milestoneId, signal),
    staleTime: 30 * 1000,
  });
  const error = milestoneQuery.error;
  // React Query keeps the last success when a refetch fails, and exposes both
  // data and error. A settled read error is the detail permission contract:
  // hide retained identity, record actions, and body. Do not clear the cache.
  const milestone = error == null ? milestoneQuery.data : undefined;

  // B2e fixup — a dirty title edit confirms before the header close discards
  // it (ui-design-system: "Dirty forms warn before close"). Clean, loading,
  // and failed-read states keep closing immediately. R3 — the same dirty
  // state is also reported upward so the route can confirm record switches.
  const [titleDirty, setTitleDirty] = React.useState(false);
  const handleTitleDirtyChange = React.useCallback(
    (dirty: boolean) => {
      setTitleDirty(dirty);
      onTitleDirtyChange?.(dirty);
    },
    [onTitleDirtyChange],
  );
  const [discardTitleOpen, setDiscardTitleOpen] = React.useState(false);

  function handleHeaderClose(): void {
    if (titleDirty) {
      setDiscardTitleOpen(true);
      return;
    }
    onClose();
  }

  return (
    <aside className="flex h-full flex-col bg-surface-detail">
      {/* Panel chrome first: header and close stay mounted independently of the
          query result, so pending, denied, and unavailable reads all stay
          dismissible. Identity and record actions render only for a successful
          read with no terminal error — never for cached data after 403/404. */}
      <DetailPanelHeader
        kind="milestone"
        onClose={handleHeaderClose}
        {...(milestone !== undefined
          ? {
              id: milestone.display_id,
              extras: (
                <DetailPanelHeaderActions
                  entityKind="milestone"
                  entityId={milestone.id}
                  copyUrl={`/tasks?view=milestones&param=${milestone.id}`}
                />
              ),
            }
          : {})}
      />
      {milestone === undefined ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {milestoneQuery.isLoading ? (
            <div className="p-4 text-sm text-text-muted">Loading Milestone…</div>
          ) : error !== null && isPermissionDenied(error) ? (
            <PermissionBlockedPanel
              state="denied"
              category="Milestone detail"
              reason={error.message}
              className="m-4"
            />
          ) : (
            <div className="p-4 text-sm text-accent-danger">Milestone detail unavailable.</div>
          )}
        </div>
      ) : (
        <MilestoneDetailContent
          // B2e fixup — editor state is per record: the keyed remount drops
          // editingTitle/titleDraft when the selected milestone changes, so a
          // cached destination can never inherit another record's draft.
          key={milestone.id}
          milestone={milestone}
          scrollRef={scrollRef}
          actorNamesById={actorNamesById}
          managedSystemNamesById={managedSystemNamesById}
          analyticsAreaNamesById={analyticsAreaNamesById}
          onTitleDirtyChange={handleTitleDirtyChange}
        />
      )}
      <DirtyConfirmation
        open={discardTitleOpen}
        onConfirm={() => {
          setDiscardTitleOpen(false);
          setTitleDirty(false);
          onClose();
        }}
        onCancel={() => setDiscardTitleOpen(false)}
      />
    </aside>
  );
}

export interface MilestoneCreatePanelProps {
  managedSystems: ReadonlyArray<{ id: string; name: string }>;
  /** Astra finding 4 — create options carry ownership/archive metadata: the
      API rejects an area of another Managed System (422 out_of_scope) and an
      archived area (409 parent_archived), so the panel offers only active
      areas of the selected system. Row display keeps its own lookups with
      archived entries; this list is create-specific. */
  analyticsAreas: ReadonlyArray<{
    id: string;
    name: string;
    managed_system_id: string;
    archived: boolean;
  }>;
  actors: ReadonlyArray<{ id: string; display_name: string }>;
  /** Concrete Managed System uuid to preselect; the `all` scope passes null. */
  defaultManagedSystemId: string | null;
  onCreated: (id: string) => void;
  /** B2e fixup — reports whether the form holds unsaved edits, so the route
      can confirm before a selection discards them. */
  onDirtyChange?: (dirty: boolean) => void;
  onCancel: () => void;
}

// #514 B2e — the same property block in a create state (§7 item 10): the
// New milestone toolbar control opens it in the existing ListShell detail
// slot; there is no separate create screen. Managed System is the required
// create input (A3/A8) and is submitted as primary_managed_system_id — the
// body never carries managed_system_id, and this form sends no status:
// omitted status stores the ADR-0050 column default 'planning', and status
// changes go through the detail panel's ADR-0050 status control.
export function MilestoneCreatePanel({
  managedSystems,
  analyticsAreas,
  actors,
  defaultManagedSystemId,
  onCreated,
  onDirtyChange,
  onCancel,
}: MilestoneCreatePanelProps) {
  const [title, setTitle] = React.useState('');
  const [why, setWhy] = React.useState('');
  const [managedSystemId, setManagedSystemId] = React.useState(defaultManagedSystemId ?? '');
  const [analyticsAreaId, setAnalyticsAreaId] = React.useState('');
  const [ownerActorId, setOwnerActorId] = React.useState('');
  const [startDate, setStartDate] = React.useState('');
  const [targetDate, setTargetDate] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);
  // B2e fixup — the header close confirms before discarding an unsaved draft.
  const [confirmingClose, setConfirmingClose] = React.useState(false);

  // Any deviation from the initial fields is an unsaved draft; derived from
  // the controlled state so no change path can bypass it.
  const dirty =
    title !== '' ||
    why !== '' ||
    managedSystemId !== (defaultManagedSystemId ?? '') ||
    analyticsAreaId !== '' ||
    ownerActorId !== '' ||
    startDate !== '' ||
    targetDate !== '';

  // Astra finding 4 — only active areas of the selected Managed System are
  // creatable; with no system selected none can be valid yet. The raw list
  // is kept for the change handler below so a selection can be checked
  // against the newly chosen system.
  const creatableAreas = React.useMemo(
    () =>
      analyticsAreas.filter((area) => !area.archived && area.managed_system_id === managedSystemId),
    [analyticsAreas, managedSystemId],
  );

  function handleManagedSystemChange(nextSystemId: string): void {
    setManagedSystemId(nextSystemId);
    // An area tied to the previous system cannot ride along — the API would
    // reject the create as out_of_scope — so an incompatible selection is
    // cleared and the user re-picks for the new system.
    const areaStillValid =
      analyticsAreaId !== '' &&
      analyticsAreas.some(
        (area) =>
          area.id === analyticsAreaId && !area.archived && area.managed_system_id === nextSystemId,
      );
    if (!areaStillValid) setAnalyticsAreaId('');
  }

  React.useEffect(() => {
    onDirtyChange?.(dirty);
    // Unmount always reports clean (cancel, create success, confirmed switch).
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  function handleHeaderClose(): void {
    if (dirty) {
      setConfirmingClose(true);
      return;
    }
    onCancel();
  }

  // Astra finding 3 — an uncertain create (the server may have committed the
  // row but the response was lost) leaves the form open with an error. The
  // key and submitted payload survive for retries of the same logical
  // creation, so the server replays the stored response instead of creating
  // a second Milestone; a changed payload or a completed creation rotates
  // the key (reuse with a different body would be 409
  // conflict.idempotency_key_reuse).
  const attemptRef = React.useRef<{ key: string; payload: CreateMilestoneRequest } | null>(null);

  function buildCreatePayload(): CreateMilestoneRequest {
    // Same literal field order every call, so retry equality below is sound.
    return {
      title: title.trim(),
      why: why.trim(),
      primary_managed_system_id: managedSystemId,
      start_date: startDate,
      target_date: targetDate,
      // Optional fields stay off the body when unset: owner defaults to the
      // creator, Analytics Area stays null server-side.
      ...(ownerActorId !== '' ? { owner_actor_id: ownerActorId } : {}),
      ...(analyticsAreaId !== '' ? { analytics_area_id: analyticsAreaId } : {}),
    };
  }

  // R5 (Astra P2-1) — the mounted instance is the create session. React
  // Query may deliver the mutation result after the form was dismissed or
  // superseded; such a completion is stale and must not drive the route
  // (closing a newer create form or selecting the abandoned record). The
  // server-side create itself is not conflated with the UI dismissal.
  const sessionMountedRef = React.useRef(true);
  React.useEffect(() => {
    sessionMountedRef.current = true;
    return () => {
      sessionMountedRef.current = false;
    };
  }, []);

  const createMutation = useMutation<
    MilestoneDto,
    Error,
    { payload: CreateMilestoneRequest; idempotencyKey: string }
  >({
    mutationFn: ({ payload, idempotencyKey }) => createMilestone(payload, idempotencyKey),
    onSuccess: (created) => {
      // The creation completed: the form hands over to the detail panel, and
      // any later session must not inherit this key.
      attemptRef.current = null;
      // R5 — a completion arriving after dismissal/unmount is a stale
      // session: ignore it so it cannot close a newer create form or select
      // the abandoned record.
      if (!sessionMountedRef.current) return;
      onCreated(created.id);
    },
    onError: (err) => setFormError(err.message),
  });

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    // F4 followup — a scoped deep link can name an archived system: the select
    // then holds a hidden id the options list never offered, and submitting it
    // is a guaranteed 409 conflict.parent_archived. A selection that is not
    // among the offered active options is treated as missing; a real user
    // selection always comes from that list, so it is never overwritten here.
    const systemOffered = managedSystems.some((system) => system.id === managedSystemId);
    if (
      title.trim() === '' ||
      why.trim() === '' ||
      managedSystemId === '' ||
      !systemOffered ||
      startDate === '' ||
      targetDate === ''
    ) {
      setFormError('Title, why, Managed System, Start, and Target are required.');
      return;
    }
    setFormError(null);
    const payload = buildCreatePayload();
    const attempt = attemptRef.current;
    const idempotencyKey =
      attempt !== null && JSON.stringify(attempt.payload) === JSON.stringify(payload)
        ? attempt.key
        : crypto.randomUUID();
    attemptRef.current = { key: idempotencyKey, payload };
    createMutation.mutate({ payload, idempotencyKey });
  }

  const dateClassName =
    'rounded border border-border-subtle bg-surface-detail px-2 py-1.5 text-sm text-text-primary';

  return (
    <aside className="flex h-full flex-col bg-surface-detail">
      {/* No display id exists yet: the header chrome mounts without record
          identity, mirroring the pending detail read. */}
      <DetailPanelHeader kind="milestone" onClose={handleHeaderClose} />
      <form
        className="min-h-0 flex-1 overflow-y-auto"
        data-testid="milestone-create-panel"
        onSubmit={submit}
      >
        <div className="px-4 pb-3 pt-4">
          <MilestonePanelSectionTitle>New milestone</MilestonePanelSectionTitle>
        </div>
        <div className="border-t border-border-subtle py-2">
          <MilestonePanelSectionTitle className="px-4">Properties</MilestonePanelSectionTitle>
          <FieldRow label="Title">
            <Input
              aria-label="Title"
              className="w-56"
              disabled={createMutation.isPending}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </FieldRow>
          <FieldRow label="Why this milestone exists">
            <Textarea
              aria-label="Why this milestone exists"
              className="w-56"
              rows={3}
              disabled={createMutation.isPending}
              value={why}
              onChange={(event) => setWhy(event.target.value)}
            />
          </FieldRow>
          <FieldRow label="Managed System">
            <select
              aria-label="Managed System"
              className={selectClassName}
              value={managedSystemId}
              disabled={createMutation.isPending}
              onChange={(event) => handleManagedSystemChange(event.target.value)}
            >
              <option value="">Select…</option>
              {managedSystems.map((system) => (
                <option key={system.id} value={system.id}>
                  {system.name}
                </option>
              ))}
            </select>
          </FieldRow>
          <FieldRow label="Analytics Area">
            <select
              aria-label="Analytics Area"
              className={selectClassName}
              value={analyticsAreaId}
              disabled={createMutation.isPending}
              onChange={(event) => setAnalyticsAreaId(event.target.value)}
            >
              <option value="">—</option>
              {creatableAreas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
          </FieldRow>
          <FieldRow label="Owner">
            <select
              aria-label="Owner"
              className={selectClassName}
              value={ownerActorId}
              disabled={createMutation.isPending}
              onChange={(event) => setOwnerActorId(event.target.value)}
            >
              <option value="">—</option>
              {actors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.display_name}
                </option>
              ))}
            </select>
          </FieldRow>
          <FieldRow label="Start">
            <input
              aria-label="Start"
              className={dateClassName}
              type="date"
              disabled={createMutation.isPending}
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </FieldRow>
          <FieldRow label="Target">
            <input
              aria-label="Target"
              className={dateClassName}
              type="date"
              disabled={createMutation.isPending}
              value={targetDate}
              onChange={(event) => setTargetDate(event.target.value)}
            />
          </FieldRow>
        </div>
        <div className="flex items-center gap-2 border-t border-border-subtle px-4 py-3">
          <Button type="submit" variant="primary" size="sm" disabled={createMutation.isPending}>
            Create milestone
          </Button>
          <Button type="button" variant="subtle" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          {formError !== null && <span className="text-sm text-accent-danger">{formError}</span>}
        </div>
      </form>
      <DirtyConfirmation
        open={confirmingClose}
        onConfirm={() => {
          setConfirmingClose(false);
          onCancel();
        }}
        onCancel={() => setConfirmingClose(false)}
      />
    </aside>
  );
}

interface MilestoneDetailContentProps {
  milestone: MilestoneDetailDto;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  actorNamesById: ReadonlyMap<string, string>;
  managedSystemNamesById: ReadonlyMap<string, string>;
  analyticsAreaNamesById: ReadonlyMap<string, string>;
  /** B2e fixup — reports whether a header close would discard a title draft. */
  onTitleDirtyChange: (dirty: boolean) => void;
}

function MilestoneDetailContent({
  milestone,
  scrollRef,
  actorNamesById,
  managedSystemNamesById,
  analyticsAreaNamesById,
  onTitleDirtyChange,
}: MilestoneDetailContentProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sourceFinding = milestone.source_finding;

  // #514 B2d-tasks — the section reads the milestone's child rows through the
  // existing tasks client (GET /tasks?milestone_id=); the header count is the
  // real row count, not the prototype's plannedTasks-derived totalPlanned.
  const childTasksQuery = useQuery({
    queryKey: ['tasks', { milestone_id: milestone.id }] as const,
    queryFn: ({ signal }) => listTasks({ milestone_id: milestone.id, signal }),
    staleTime: 30 * 1000,
  });
  // B2d fixup F1 — the child read has its own lifetime, so a terminal error
  // (e.g. a denied refetch after a permission change) must win over the data
  // React Query retains: no count in the nav or section title, no rows. Same
  // contract as the milestone read above (R2-1).
  const childTasks = childTasksQuery.error == null ? childTasksQuery.data?.items : undefined;

  // B2e — title-only edit. Managed System is a create-only field (A3/A8) and
  // never becomes an input here; the PATCH carries the title and If-Match
  // with a fresh idempotency key, nothing else. The If-Match is the row's
  // updated_at captured when editing starts (Astra finding 2): a background
  // refetch that delivers a newer version must not rebase the unsaved draft
  // onto it, or Save would silently overwrite the concurrent change instead
  // of losing the race as a 409 conflict.stale_write.
  const [editingTitle, setEditingTitle] = React.useState(false);
  const [titleDraft, setTitleDraft] = React.useState('');
  const [titleEditVersion, setTitleEditVersion] = React.useState<string | null>(null);
  const [titleError, setTitleError] = React.useState<string | null>(null);
  // B2e fixup — an open editor with a changed draft is unsaved work; a
  // touched-then-reverted draft equals the stored title and closes freely.
  const titleDirty = editingTitle && titleDraft !== milestone.title;
  React.useEffect(() => {
    onTitleDirtyChange(titleDirty);
    // Unmount (record switch via key=milestone.id) always reports clean.
    return () => onTitleDirtyChange(false);
  }, [titleDirty, onTitleDirtyChange]);
  const titleMutation = useMutation<MilestoneDto, Error, { ifMatch: string }>({
    mutationFn: async ({ ifMatch }) =>
      updateMilestone(
        milestone.id,
        { title: titleDraft.trim() },
        { ifMatch, idempotencyKey: crypto.randomUUID() },
      ),
    onSuccess: async () => {
      setEditingTitle(false);
      setTitleEditVersion(null);
      setTitleError(null);
      // Detail read returns the stored row; the list shows the new title too.
      await queryClient.invalidateQueries({ queryKey: ['milestone', milestone.id] });
      await queryClient.invalidateQueries({ queryKey: ['milestones'] });
    },
    onError: async (err) => {
      if (err instanceof ApiError && err.status === 409 && err.code === 'conflict.stale_write') {
        // Stale If-Match: the server row wins. Drop the typed title, refetch,
        // and show the stored title — never layer the draft over it.
        setEditingTitle(false);
        setTitleDraft('');
        setTitleEditVersion(null);
        setTitleError(null);
        await queryClient.refetchQueries({ queryKey: ['milestone', milestone.id], exact: true });
      } else {
        setTitleError(err.message);
      }
    },
  });

  function startTitleEdit(): void {
    // R4 followup — reopening while either mutation's post-save refetch is in
    // flight would capture the stale cached row's version (the button is
    // disabled; this guards the programmatic/Enter-adjacent path too).
    if (titleMutation.isPending || statusMutation.isPending) return;
    setTitleDraft(milestone.title);
    // Astra finding 2 — the concurrency token is bound at edit start; a
    // refetch while editing never moves it (see the titleEditVersion comment).
    setTitleEditVersion(milestone.updated_at);
    setTitleError(null);
    setEditingTitle(true);
  }

  function cancelTitleEdit(): void {
    setEditingTitle(false);
    setTitleEditVersion(null);
    setTitleError(null);
  }

  function submitTitleEdit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    // R3 — serialized with the status mutation: a same-version title request
    // sent while a status change is in flight would be 409-cleared the
    // moment the status write commits. The disabled Save button and this
    // guard (Enter submits the form too) both refuse the race.
    if (titleMutation.isPending || statusMutation.isPending) return;
    if (titleDraft.trim() === '') {
      setTitleError('Title is required.');
      return;
    }
    // Unreachable in practice — the editor only opens via startTitleEdit,
    // which pins the version — but the stale-write contract must never
    // silently fall back to the latest refetched token.
    if (titleEditVersion === null) return;
    titleMutation.mutate({ ifMatch: titleEditVersion });
  }

  // B2e-status (ADR-0050) — the Properties Status control. A change PATCHes
  // { status } with If-Match (the row's updated_at) and a fresh idempotency
  // key; the body never carries primary_managed_system_id. The select is
  // controlled by the stored status, so a failed PATCH keeps the prior value,
  // and a stale write refetches and shows the server row (same contract as
  // the title edit). The request token rides in the mutation variables.
  const [statusError, setStatusError] = React.useState<string | null>(null);
  const statusMutation = useMutation<
    MilestoneDto,
    Error,
    { status: MilestoneStatusFilter; ifMatch: string }
  >({
    mutationFn: async ({ status, ifMatch }) =>
      updateMilestone(milestone.id, { status }, { ifMatch, idempotencyKey: crypto.randomUUID() }),
    onSuccess: async (updated, { ifMatch: requestToken }) => {
      setStatusError(null);
      // R2 — the draft token is advanced ONLY when the status PATCH started
      // from the same version the open draft was composed against: the two
      // writes were coordinated, so the next title save succeeds instead of
      // 409-discarding the user's own work. A PATCH sent from an externally
      // newer version does not match, so the older draft keeps its own token
      // and cannot rebase over the external change.
      if (titleEditVersion !== null && titleEditVersion === requestToken) {
        setTitleEditVersion(updated.updated_at);
      }
      // Detail read returns the stored row; the list badge reflects it too.
      await queryClient.invalidateQueries({ queryKey: ['milestone', milestone.id] });
      await queryClient.invalidateQueries({ queryKey: ['milestones'] });
    },
    onError: async (err) => {
      if (err instanceof ApiError && err.status === 409 && err.code === 'conflict.stale_write') {
        setStatusError(null);
        // B2e-status fixup (midreview P2) — the refetched row carries a new
        // concurrency token, so an open title draft composed against the old
        // row must not silently rebase onto it (the server could no longer
        // reject the stale draft). Same reconciliation as the title-409
        // branch: discard the editor, draft, and captured version before the
        // refetch. A generic failure keeps the editor and draft untouched.
        setEditingTitle(false);
        setTitleDraft('');
        setTitleEditVersion(null);
        setTitleError(null);
        await queryClient.refetchQueries({ queryKey: ['milestone', milestone.id], exact: true });
      } else {
        setStatusError(err.message);
      }
    },
  });

  function handleStatusChange(event: React.ChangeEvent<HTMLSelectElement>): void {
    const status = event.target.value as MilestoneStatusFilter;
    if (status === milestone.status) return;
    // R3 — serialized with the title mutation: a status change issued while
    // a title save is in flight would commit from the same version and
    // 409-clear the just-submitted draft. The disabled select and this guard
    // both refuse the race.
    if (statusMutation.isPending || titleMutation.isPending) return;
    setStatusError(null);
    // R2 — the token is captured here so onSuccess can compare it with the
    // open draft's captured version (same-version-only coordination).
    statusMutation.mutate({ status, ifMatch: milestone.updated_at });
  }

  // R4 (Astra P2-3) — Open finding is a navigation that would discard an
  // unsaved title draft; it goes through the same scoped discard
  // confirmation as the header close. No other navigation is guarded.
  const [pendingFindingId, setPendingFindingId] = React.useState<string | null>(null);

  const areaName =
    milestone.analytics_area_id !== null
      ? analyticsAreaNamesById.get(milestone.analytics_area_id)
      : undefined;
  const ownerName = actorNamesById.get(milestone.owner_actor_id);
  const managedSystemName =
    managedSystemNamesById.get(milestone.primary_managed_system_id) ?? 'Managed System';

  return (
    <>
      <DetailPanelSectionNav
        sections={SECTIONS.map((section) =>
          section.id === 'tasks' && childTasks !== undefined
            ? { ...section, count: childTasks.length }
            : section,
        )}
        scrollRef={scrollRef}
      />
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-6 pt-7 pb-8"
        data-testid="milestone-detail-scroll"
      >
        {/* CP-pixel finding 3 (.review/pixel-514-findings.md): the panel body
            carries the prototype's density (styles.css): .panel-scroll padding
            28/24/32 here, .panel-section 32px bottom rhythm (mb-8) on the
            sections below, .panel-title-block margin-bottom 24 only (the
            shared px-4 py-3 is neutralized — no extra inset), and 12px-pad
            nested cards instead of the earlier 16px-padding bordered cards.
            Feature-local classes only; shared panel components are consumed,
            not redesigned. The 24px scroll padding owns all horizontal insets. */}
        <div data-anchor="overview">
          <PanelTitleBlock
            className="mb-6 p-0"
            title={milestone.title}
            badges={
              <>
                <MilestoneStatusBadge status={milestone.status} />
                <MilestoneManagedSystemPill name={managedSystemName} />
                {areaName !== undefined && (
                  <MilestoneOutlineBadge>{areaName}</MilestoneOutlineBadge>
                )}
              </>
            }
          />

          {/* B2e — title-only edit control; distinct from the toolbar's create
              control. Only the title becomes an input; a stale If-Match
              refetches and shows the server title. */}
          {editingTitle ? (
            <form
              className="mb-4 flex flex-col gap-2 rounded-sm border border-border-subtle bg-surface-card p-3"
              onSubmit={submitTitleEdit}
            >
              <div className="flex flex-col gap-1 text-xs text-text-muted">
                <span>Title</span>
                <Input
                  aria-label="Title"
                  disabled={titleMutation.isPending}
                  value={titleDraft}
                  onChange={(event) => {
                    setTitleDraft(event.target.value);
                    setTitleError(null);
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={titleMutation.isPending || statusMutation.isPending}
                >
                  Save
                </Button>
                <Button type="button" variant="subtle" size="sm" onClick={cancelTitleEdit}>
                  Cancel
                </Button>
                {titleError !== null && (
                  <span className="text-sm text-accent-danger">{titleError}</span>
                )}
              </div>
            </form>
          ) : (
            <div className="mb-4 flex justify-end">
              {/* R4 followup — titleMutation and statusMutation both stay
                  pending through their onSuccess invalidateQueries await;
                  reopening the editor in that window captures the stale
                  cached row's title/version, so the button locks while either
                  mutation is pending and the handler refuses the race. */}
              <Button
                variant="subtle"
                size="sm"
                className="gap-1.5"
                disabled={titleMutation.isPending || statusMutation.isPending}
                onClick={startTitleEdit}
              >
                <Pencil className="h-3 w-3" aria-hidden="true" />
                Edit title
              </Button>
            </div>
          )}

          {/* Progress strip — real child-Task buckets from progress (B1c);
              no planned bucket, planned tasks are prototype-only. Nested card
              per finding 3: 12px pad, no extra horizontal inset (the 24px
              scroll padding owns alignment). */}
          <div className="mb-8 flex flex-col gap-2.5 rounded-md bg-surface-canvas p-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-text-primary">
                {milestone.progress.released_done} of {milestone.progress.total} tasks released
              </span>
              <span className="text-sm font-semibold tabular-nums text-text-secondary">
                {milestone.progress.percent}%
              </span>
            </div>
            {/* Decorative bar — the strip's text already carries the numbers. */}
            <div className="h-1 overflow-hidden rounded-full bg-border-subtle" aria-hidden="true">
              <div
                className="h-full bg-accent-primary"
                style={{ width: `${milestone.progress.percent}%` }}
              />
            </div>
            <div className="flex items-center gap-2.5 text-xs text-text-muted">
              <span>
                <span className="font-semibold tabular-nums text-text-secondary">
                  {milestone.progress.released_done}
                </span>{' '}
                released/done
              </span>
              <span aria-hidden="true">·</span>
              <span>
                <span className="font-semibold tabular-nums text-text-secondary">
                  {milestone.progress.in_flight}
                </span>{' '}
                in flight
              </span>
              <span aria-hidden="true">·</span>
              <span>
                <span className="font-semibold tabular-nums text-text-secondary">
                  {milestone.progress.queued}
                </span>{' '}
                queued
              </span>
            </div>
          </div>

          {/* Why this milestone exists — required by FR-TASK-004. The prototype
              nests the plain-text why in NestedTextBlock (screen-milestones.jsx):
              plain text, no rich content in the DTO. The shared block keeps its
              border (shown in the reference baseline); only the type scale is
              corrected to the prototype 13px/1.6 (finding P3-1). */}
          <div className="mb-8">
            <MilestonePanelSectionTitle>Why this milestone exists</MilestonePanelSectionTitle>
            <NestedTextBlock className="p-3 text-[13px] leading-[1.6] text-text-secondary">
              {milestone.why}
            </NestedTextBlock>
          </div>

          <div className="mb-8">
            {/* Title row carries the prototype's Open finding action when a
                source Finding is linked (finding 3): navigation to the existing
                Finding detail route only — no Finding → Milestone writer. */}
            <div className="flex items-center justify-between">
              <MilestonePanelSectionTitle className="mb-0">Source</MilestonePanelSectionTitle>
              {sourceFinding !== null && (
                <Button
                  variant="subtle"
                  size="sm"
                  className="h-6 gap-1.5 px-2 text-[12px]"
                  onClick={() => {
                    // R4 — an unsaved title draft confirms before the panel
                    // is left; a clean panel navigates immediately.
                    if (titleDirty) {
                      setPendingFindingId(sourceFinding.id);
                      return;
                    }
                    void navigate({
                      to: '/findings/$findingId',
                      params: { findingId: sourceFinding.id },
                    });
                  }}
                >
                  <ArrowRight className="h-[11px] w-[11px]" aria-hidden="true" />
                  Open finding
                </Button>
              )}
            </div>
            {sourceFinding ? (
              <div className="mt-2.5 flex flex-col gap-1.5 rounded-md bg-surface-canvas p-3">
                <span className="text-xs text-text-muted">From finding</span>
                <div className="text-[13px] font-medium text-text-primary">
                  <span className="mr-1.5 font-mono text-xs text-text-muted">
                    {sourceFinding.display_id}
                  </span>
                  {sourceFinding.title}
                </div>
                {/* Prototype renders the finding summary at 12px (text-xs) with
                    1.55 line height (screen-milestones.jsx Source block). */}
                <p className="text-xs leading-[1.55] text-text-muted">{sourceFinding.summary}</p>
                <div className="flex flex-wrap gap-2">
                  <MilestoneOutlineBadge>
                    Evidence · {sourceFinding.evidence_count}
                  </MilestoneOutlineBadge>
                </div>
              </div>
            ) : (
              // No Finding → Milestone writer exists (#514 out-of-scope list):
              // ship the prototype's standalone copy without a Link control.
              <div className="mt-2 text-sm text-text-muted">
                근거 Finding 이 연결되어 있지 않습니다. Standalone milestone 으로 운영 중입니다.
              </div>
            )}
          </div>

          <div className="mb-8">
            <MilestonePanelSectionTitle>Properties</MilestonePanelSectionTitle>
            {/* The scroll container owns horizontal padding. These local rows
                use the prototype's 120px value column and left alignment. */}
            <FieldRow label="Status" className={milestonePropertyFieldClassName}>
              {/* B2e-status (ADR-0050): the closed set is accepted, so the
                  control offers exactly these four values; PATCH is free
                  among them. The title-block badge above stays read-only. */}
              <span className="flex items-center justify-end gap-2">
                <select
                  aria-label="Status"
                  className={selectClassName}
                  value={milestone.status}
                  disabled={statusMutation.isPending || titleMutation.isPending}
                  onChange={handleStatusChange}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {statusError !== null && (
                  <span className="text-sm text-accent-danger">{statusError}</span>
                )}
              </span>
            </FieldRow>
            {/* Managed System is create-only (A3/A8): read-only text, never an input. */}
            <FieldRow label="Managed System" className={milestonePropertyFieldClassName}>
              <MilestoneManagedSystemPill name={managedSystemName} />
            </FieldRow>
            <FieldRow label="Analytics Area" className={milestonePropertyFieldClassName}>
              {areaName !== undefined ? (
                <MilestoneOutlineBadge>{areaName}</MilestoneOutlineBadge>
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </FieldRow>
            {/* Owner per finding 4: the prototype renders a UserChip here
                (screen-milestones.jsx Properties) — the milestone-local chip
                keeps avatar + display name at the prototype 18px/9px avatar
                geometry; an actor missing from the directory keeps the
                explicit — fallback (missing-actor handling preserved). */}
            <FieldRow label="Owner" className={milestonePropertyFieldClassName}>
              {ownerName !== undefined ? (
                <MilestoneOwnerChip name={ownerName} />
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </FieldRow>
            <FieldRow label="Start" className={milestonePropertyFieldClassName}>
              <span className="font-mono text-xs text-text-secondary">{milestone.start_date}</span>
            </FieldRow>
            <FieldRow label="Target" className={milestonePropertyFieldClassName}>
              <span className="font-mono text-xs text-text-secondary">{milestone.target_date}</span>
            </FieldRow>
            <FieldRow label="Created" className={milestonePropertyFieldClassName}>
              {milestone.created_at.slice(0, 10)}
            </FieldRow>
          </div>
        </div>

        {/* #514 B2d-tasks — flat child Task list (screen-milestones.jsx:402-416).
            The prototype's Add task action has no #514 writer behind it, so the
            section ships read-only; assign/unassign lives on the Task detail. */}
        <div data-anchor="tasks" className="mb-8">
          <MilestonePanelSectionTitle>
            {childTasks === undefined ? 'Tasks' : `Tasks · ${childTasks.length}`}
          </MilestonePanelSectionTitle>
          {childTasksQuery.error !== null ? (
            isPermissionDenied(childTasksQuery.error) ? (
              // B2d fixup F1 — a denied child-list read is the permission
              // contract, not an outage: the same classification as the
              // milestone read and TaskListRoute drives the approved blocked
              // panel with the server's reason.
              <PermissionBlockedPanel
                state="denied"
                category="Task list"
                reason={childTasksQuery.error.message}
              />
            ) : (
              // Same terminal copy as the Tasks list route (TaskListRoute).
              <div className="py-3 text-center text-xs text-text-muted">Task list unavailable.</div>
            )
          ) : childTasks !== undefined && childTasks.length === 0 ? (
            <div className="py-3 text-center text-xs text-text-muted">
              아직 연결된 Task 가 없습니다.
            </div>
          ) : childTasks !== undefined ? (
            <div className="flex flex-col gap-1.5">
              {childTasks.map((task) => (
                <MilestoneTaskRow
                  key={task.id}
                  task={task}
                  // B2d fixup F2 — a non-null assignee id missing from the
                  // directory (lookup pending or failed) keeps the explicit
                  // 'Assigned' fallback from the Task list/detail; the avatar
                  // slot renders it until the name resolves.
                  assigneeName={
                    task.assignee_actor_id !== null
                      ? (actorNamesById.get(task.assignee_actor_id) ?? 'Assigned')
                      : undefined
                  }
                />
              ))}
            </div>
          ) : null}
        </div>

        <div data-anchor="evidence" className="mb-8 last:mb-0">
          <MilestonePanelSectionTitle>Evidence</MilestonePanelSectionTitle>
          {/* No evidence read path in these slices (manual linking is §7 item 14);
              empty copy only — no Outcome survey controls (FOP-OUT-014). */}
          <div className="py-3 text-center text-xs text-text-muted">
            연결된 evidence highlight 가 없습니다.
          </div>
        </div>

        <div data-anchor="activity" className="last:mb-0">
          <MilestonePanelSectionTitle>Activity</MilestonePanelSectionTitle>
          {/* No audit_log read path exists (§7 item 9); the empty copy ships. */}
          <div className="py-3 text-center text-xs text-text-muted">활동 기록이 없습니다.</div>
        </div>
      </div>
      {/* R4 — scoped to the Open finding action only: confirm discards the
          draft (same reset as the header close) and navigates to the linked
          Finding; decline keeps the editor and the draft. */}
      <DirtyConfirmation
        open={pendingFindingId !== null}
        onConfirm={() => {
          const findingId = pendingFindingId;
          setPendingFindingId(null);
          setEditingTitle(false);
          setTitleDraft('');
          setTitleEditVersion(null);
          if (findingId !== null) {
            void navigate({ to: '/findings/$findingId', params: { findingId } });
          }
        }}
        onCancel={() => setPendingFindingId(null)}
      />
    </>
  );
}

function isPermissionDenied(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.status === 403 &&
    (error.code === 'permission.denied' || error.code === 'permission.scope_required')
  );
}
