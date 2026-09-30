import { mapUnknownError, useIdempotencyKey } from '@/lib/api';
import { createMilestone } from '@/lib/api/milestones';
import type { CreateMilestoneRequest, MilestoneDto } from '@fops/shared';
import {
  Button,
  DatePicker,
  DetailPanelHeader,
  DirtyConfirmation,
  FieldRow,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@fops/ui';
import { useMutation } from '@tanstack/react-query';
import * as React from 'react';
import { MilestonePanelSectionTitle } from '../MilestoneIdentity';

const NO_SELECTION = '__none__';

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

  // Same literal field order every render, so retry equality below is sound.
  const payload: CreateMilestoneRequest = {
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
  const { key: idempotencyKey, markConsumed } = useIdempotencyKey();
  const lastAttemptFingerprintRef = React.useRef<string | null>(null);

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
      lastAttemptFingerprintRef.current = null;
      markConsumed();
      // R5 — a completion arriving after dismissal/unmount is a stale
      // session: ignore it so it cannot close a newer create form or select
      // the abandoned record.
      if (!sessionMountedRef.current) return;
      onCreated(created.id);
    },
    onError: (err) => setFormError(mapUnknownError(err).message),
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
    // Astra finding 3 — an uncertain create (the server may have committed the
    // row but the response was lost) leaves the form open with an error. Keep
    // the key and submitted fingerprint together so an identical retry replays
    // the stored response instead of creating a second Milestone. Rotate only
    // when a changed payload is submitted or a creation succeeds; reusing a key
    // with another body would be 409 conflict.idempotency_key_reuse.
    const fingerprint = JSON.stringify(payload);
    let key = idempotencyKey;
    if (
      lastAttemptFingerprintRef.current !== null &&
      lastAttemptFingerprintRef.current !== fingerprint
    ) {
      const k = markConsumed();
      key = k;
    }
    lastAttemptFingerprintRef.current = fingerprint;
    createMutation.mutate({ payload, idempotencyKey: key });
  }

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
            <Select
              value={managedSystemId || NO_SELECTION}
              disabled={createMutation.isPending}
              onValueChange={(value) =>
                handleManagedSystemChange(value === NO_SELECTION ? '' : value)
              }
            >
              <SelectTrigger aria-label="Managed System" value={managedSystemId} className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SELECTION}>Select…</SelectItem>
                {managedSystems.map((system) => (
                  <SelectItem key={system.id} value={system.id}>
                    {system.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Analytics Area">
            <Select
              value={analyticsAreaId || NO_SELECTION}
              disabled={createMutation.isPending}
              onValueChange={(value) => setAnalyticsAreaId(value === NO_SELECTION ? '' : value)}
            >
              <SelectTrigger aria-label="Analytics Area" value={analyticsAreaId} className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SELECTION}>—</SelectItem>
                {creatableAreas.map((area) => (
                  <SelectItem key={area.id} value={area.id}>
                    {area.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Owner">
            <Select
              value={ownerActorId || NO_SELECTION}
              disabled={createMutation.isPending}
              onValueChange={(value) => setOwnerActorId(value === NO_SELECTION ? '' : value)}
            >
              <SelectTrigger aria-label="Owner" value={ownerActorId} className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SELECTION}>—</SelectItem>
                {actors.map((actor) => (
                  <SelectItem key={actor.id} value={actor.id}>
                    {actor.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Start">
            <DatePicker
              aria-label="Start"
              className="bg-surface-detail"
              disabled={createMutation.isPending}
              value={startDate}
              onChange={(value) => setStartDate(value ?? '')}
            />
          </FieldRow>
          <FieldRow label="Target">
            <DatePicker
              aria-label="Target"
              className="bg-surface-detail"
              disabled={createMutation.isPending}
              value={targetDate}
              onChange={(value) => setTargetDate(value ?? '')}
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
