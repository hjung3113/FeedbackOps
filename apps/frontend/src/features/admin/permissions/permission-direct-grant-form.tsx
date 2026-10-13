import type { PermissionGrantAdminItem, PermissionGrantOptions } from '@fops/shared';
import {
  Button,
  Checkbox,
  DatePicker,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@fops/ui';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';

import { ApiError, mapUnknownError } from '@/lib/api';
import { mintIdempotencyKey } from '@/lib/api/idempotency';
import { fetchPermissionGrantOptions, permissionGrantOptionsKey } from '@/lib/api/permissions';
import { useMe } from '@/lib/auth/useMe';
import { ADMIN_PERMISSIONS_COPY } from '@/lib/copy/admin-permissions';
import { getCapabilityDisplayLabel } from '@/lib/copy/capabilities';
import { SCOPE_SELECTOR_COPY } from '@/lib/copy/managed-system-scope';
import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import { shortId } from '@/lib/identity';
import { InternalLink } from '@/lib/router/InternalLink';

import { useDirectPermissionGrant } from './useDirectPermissionGrant.js';

type DirectGrantCandidate = PermissionGrantOptions['candidates'][number];

const DIRECT_GRANT_COPY = ADMIN_PERMISSIONS_COPY.directGrant;

function candidateKey(candidate: DirectGrantCandidate): string {
  return `${candidate.capability}|${candidate.managed_system_id ?? 'workspace'}`;
}

function candidateLabel(
  candidate: DirectGrantCandidate,
  managedSystemNames: Record<string, string>,
): string {
  const scope = candidate.managed_system_id
    ? (managedSystemNames[candidate.managed_system_id] ??
      `Managed System · ${shortId(candidate.managed_system_id)}`)
    : SCOPE_SELECTOR_COPY.workspaceAll;
  return `${getCapabilityDisplayLabel(candidate.capability)} · ${scope}`;
}

function toFutureExpiration(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const expiresAt = `${value}T23:59:59.000Z`;
  const timestamp = Date.parse(expiresAt);
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== value ||
    timestamp <= Date.now()
  ) {
    return undefined;
  }
  return expiresAt;
}

function minimumExpirationDate(): string {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  return Date.parse(`${today}T23:59:59.000Z`) > now
    ? today
    : new Date(now + 86_400_000).toISOString().slice(0, 10);
}

function conflictDestination(
  error: unknown,
): { href: string; label: string; closesDialog: boolean } | null {
  if (!(error instanceof ApiError) || !error.detail) return null;
  if (
    error.code === 'conflict.permission_request_duplicate' &&
    typeof error.detail.review_route === 'string'
  ) {
    return {
      href: error.detail.review_route,
      label: DIRECT_GRANT_COPY.reviewLink,
      closesDialog: false,
    };
  }
  if (
    error.code === 'conflict.capability_already_denied' &&
    typeof error.detail.lift_route === 'string'
  ) {
    return {
      href: error.detail.lift_route,
      label: DIRECT_GRANT_COPY.denyLink,
      closesDialog: true,
    };
  }
  return null;
}

export function PermissionDirectGrantForm({
  open,
  selectionContext,
  managedSystemNames,
  activeGrants,
  cacheReturnedGrant,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  selectionContext: string;
  managedSystemNames: Record<string, string>;
  activeGrants: PermissionGrantAdminItem[];
  cacheReturnedGrant: (item: PermissionGrantAdminItem) => void;
  onOpenChange: (open: boolean) => void;
  onCreated: (item: PermissionGrantAdminItem, submittedContext: string) => void;
}) {
  const actors = useWorkspaceActors({ retry: false });
  const [actorId, setActorId] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const actorSelectId = React.useId();
  const grantOptionsQuery = useQuery({
    queryKey: permissionGrantOptionsKey(actorId),
    queryFn: ({ signal }) => fetchPermissionGrantOptions(actorId, signal),
    enabled: open && actorId !== '',
    retry: false,
    staleTime: 0,
  });
  const grantOptions =
    open &&
    actorId !== '' &&
    !grantOptionsQuery.isPending &&
    grantOptionsQuery.data?.recipient.id === actorId
      ? grantOptionsQuery.data
      : undefined;
  const optionsUnconfirmed = grantOptionsQuery.isFetching || grantOptionsQuery.isError;
  const recipientActors = (actors.actors ?? []).filter((actor) => actor.actor_type !== 'system');

  React.useEffect(() => {
    if (open) return;
    setActorId('');
    setBusy(false);
  }, [open]);

  function handleActorChange(nextActorId: string) {
    if (busy || nextActorId === actorId) return;
    setActorId(nextActorId);
  }

  function retryActors() {
    void actors.refetch();
  }

  function retryGrantOptions() {
    void grantOptionsQuery.refetch();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent
          className="max-h-screen overflow-y-auto"
          closeLabel={DIRECT_GRANT_COPY.cancel}
          data-testid="permission-direct-grant-dialog"
        >
          <DialogHeader>
            <DialogTitle>{DIRECT_GRANT_COPY.title}</DialogTitle>
            <DialogDescription>{DIRECT_GRANT_COPY.description}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <label
              className="flex flex-col gap-2 text-sm text-text-secondary"
              htmlFor={actorSelectId}
            >
              {DIRECT_GRANT_COPY.actorLabel}
              <Select value={actorId} onValueChange={handleActorChange} disabled={busy}>
                <SelectTrigger id={actorSelectId} aria-label={DIRECT_GRANT_COPY.actorLabel}>
                  <SelectValue placeholder={DIRECT_GRANT_COPY.actorPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {recipientActors.map((actor) => (
                      <SelectItem key={actor.id} value={actor.id}>
                        {actor.display_name} · {actor.email}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>
            {actors.isPending ? (
              <p className="text-xs text-text-muted">{DIRECT_GRANT_COPY.actorLoading}</p>
            ) : null}
            {actors.isError ? (
              <div className="flex items-center gap-2 text-xs text-accent-danger">
                <p>{DIRECT_GRANT_COPY.actorError}</p>
                <Button type="button" size="sm" variant="ghost" onClick={retryActors}>
                  {DIRECT_GRANT_COPY.retry}
                </Button>
              </div>
            ) : null}
            {!actors.isPending && !actors.isError && recipientActors.length === 0 ? (
              <p className="text-xs text-text-muted">{DIRECT_GRANT_COPY.actorEmpty}</p>
            ) : null}
            {actorId !== '' && grantOptionsQuery.isPending ? (
              <p className="text-xs text-text-muted">{DIRECT_GRANT_COPY.optionLoading}</p>
            ) : null}
            {actorId !== '' && grantOptionsQuery.isError ? (
              <div className="flex items-center gap-2 text-xs text-accent-danger">
                <p>{DIRECT_GRANT_COPY.optionError}</p>
                <Button type="button" size="sm" variant="ghost" onClick={retryGrantOptions}>
                  {DIRECT_GRANT_COPY.retry}
                </Button>
              </div>
            ) : null}
            {grantOptions && grantOptions.candidates.length === 0 ? (
              <p className="text-xs text-text-muted">{DIRECT_GRANT_COPY.optionEmpty}</p>
            ) : null}
          </div>
          {grantOptions && grantOptions.candidates.length > 0 ? (
            <DirectGrantFields
              key={grantOptions.recipient.id}
              options={grantOptions}
              managedSystemNames={managedSystemNames}
              activeGrants={activeGrants}
              selectionContext={selectionContext}
              optionsUnconfirmed={optionsUnconfirmed}
              cacheReturnedGrant={cacheReturnedGrant}
              onClose={() => onOpenChange(false)}
              onCreated={onCreated}
              onPendingChange={setBusy}
            />
          ) : (
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                {DIRECT_GRANT_COPY.cancel}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function DirectGrantFields({
  options,
  managedSystemNames,
  activeGrants,
  selectionContext,
  optionsUnconfirmed,
  cacheReturnedGrant,
  onClose,
  onCreated,
  onPendingChange,
}: {
  options: PermissionGrantOptions;
  managedSystemNames: Record<string, string>;
  activeGrants: PermissionGrantAdminItem[];
  selectionContext: string;
  optionsUnconfirmed: boolean;
  cacheReturnedGrant: (item: PermissionGrantAdminItem) => void;
  onClose: () => void;
  onCreated: (item: PermissionGrantAdminItem, submittedContext: string) => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const me = useMe();
  const actorId = me.data?.actor.id ?? null;
  const [selectedCandidateKey, setSelectedCandidateKey] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [expirationDate, setExpirationDate] = React.useState('');
  const [expirationDraftValid, setExpirationDraftValid] = React.useState(true);
  const [governanceConfirmed, setGovernanceConfirmed] = React.useState(false);
  const [policyCitation, setPolicyCitation] = React.useState('');
  const [peerReviewerAbsence, setPeerReviewerAbsence] = React.useState('');
  const mounted = React.useRef(false);
  const submitting = React.useRef(false);
  const intent = React.useRef<{ fingerprint: string; key: string } | null>(null);
  const reasonId = React.useId();
  const expirationId = React.useId();
  const governanceId = React.useId();
  const policyCitationId = React.useId();
  const peerReviewerAbsenceId = React.useId();
  const mutation = useDirectPermissionGrant(cacheReturnedGrant);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const selectedCandidate = options.candidates.find(
    (candidate) => candidateKey(candidate) === selectedCandidateKey,
  );
  // Held = an active (non-expired) grant the screen already loaded for this recipient.
  const heldEntries = options.candidates.flatMap((candidate) => {
    const grant = activeGrants.find(
      (item) =>
        item.actor_id === options.recipient.id &&
        (item.expires_at === null || Date.parse(item.expires_at) > Date.now()) &&
        `${item.capability}|${item.managed_system_id ?? 'workspace'}` === candidateKey(candidate),
    );
    return grant ? [{ grant, candidate }] : [];
  });
  const isSelfGrant = actorId !== null && options.recipient.id === actorId;
  const selfGrantForbidden = isSelfGrant && options.self_policy === 'forbidden';
  const selfPolicyUnconfirmed =
    isSelfGrant && options.self_policy === 'allowed' && !options.self_approval_required;
  const selfEnvelopeRequired = isSelfGrant && options.self_policy === 'allowed';
  const selfEnvelopeReady =
    !selfEnvelopeRequired ||
    (policyCitation.trim().length > 0 && peerReviewerAbsence.trim().length > 0);
  const governanceRequired = selectedCandidate?.governance_required ?? false;
  const expiration = expirationDate === '' ? undefined : toFutureExpiration(expirationDate);
  const expirationInvalid =
    !expirationDraftValid || (expirationDate !== '' && expiration === undefined);
  const expirationReady = expirationDate === '' || expiration !== undefined;
  const preflight = selectedCandidate?.preflight;
  const preflightBlocked = preflight !== undefined && preflight.state !== 'available';
  const sessionReady = actorId !== null;
  const reasonReady = reason.trim().length > 0 && reason.trim().length <= 2000;
  const canSubmit =
    sessionReady &&
    reasonReady &&
    expirationReady &&
    selectedCandidate !== undefined &&
    !preflightBlocked &&
    !selfGrantForbidden &&
    !selfPolicyUnconfirmed &&
    selfEnvelopeReady &&
    (!governanceRequired || governanceConfirmed) &&
    !expirationInvalid &&
    !optionsUnconfirmed &&
    !mutation.isPending;
  const submitErrorDestination = conflictDestination(mutation.error);
  const mappedError = mutation.isError ? mapUnknownError(mutation.error).message : null;

  function clearErrorAndUpdate(update: () => void) {
    mutation.reset();
    update();
  }

  function submit() {
    if (!canSubmit || submitting.current || !selectedCandidate) return;
    const body = {
      actor_id: options.recipient.id,
      capability: selectedCandidate.capability,
      ...(selectedCandidate.managed_system_id !== null
        ? { managed_system_id: selectedCandidate.managed_system_id }
        : {}),
      ...(expiration !== undefined ? { expires_at: expiration } : {}),
      reason: reason.trim(),
      ...(selfEnvelopeRequired
        ? {
            self_approval: {
              policy_citation: policyCitation.trim(),
              peer_reviewer_absence: peerReviewerAbsence.trim(),
            },
          }
        : {}),
    };
    const fingerprint = JSON.stringify(body);
    if (intent.current?.fingerprint !== fingerprint) {
      intent.current = { fingerprint, key: mintIdempotencyKey() };
    }
    const idempotencyKey = intent.current.key;
    const submittedContext = selectionContext;
    submitting.current = true;
    onPendingChange(true);
    void mutation
      .mutateAsync({ body, idempotencyKey })
      .then((item) => {
        intent.current = null;
        if (mounted.current) onCreated(item, submittedContext);
      })
      .catch(() => {
        // The draft and its idempotency key remain available for an explicit retry.
      })
      .finally(() => {
        submitting.current = false;
        onPendingChange(false);
      });
  }

  return (
    <>
      <section className="flex flex-col gap-4" data-testid="direct-grant-fields">
        <p className="-mt-2 text-xs text-text-muted" data-testid="direct-grant-recipient">
          {options.recipient.display_name} · {roleLevelLabel(options.recipient.role_level)}
        </p>
        <label
          className="flex flex-col gap-2 text-sm text-text-secondary"
          htmlFor="permission-direct-grant-candidate"
        >
          {DIRECT_GRANT_COPY.optionLabel}
          <Select
            value={selectedCandidateKey}
            onValueChange={(value) =>
              clearErrorAndUpdate(() => {
                setSelectedCandidateKey(value);
                setGovernanceConfirmed(false);
                setPolicyCitation('');
                setPeerReviewerAbsence('');
              })
            }
            disabled={mutation.isPending}
          >
            <SelectTrigger
              id="permission-direct-grant-candidate"
              aria-label={DIRECT_GRANT_COPY.optionLabel}
            >
              <SelectValue placeholder={DIRECT_GRANT_COPY.optionPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {options.candidates.map((candidate) => {
                  const held = heldEntries.some((entry) => entry.candidate === candidate);
                  return (
                    <SelectItem
                      key={candidateKey(candidate)}
                      value={candidateKey(candidate)}
                      disabled={held}
                    >
                      {candidateLabel(candidate, managedSystemNames)}
                      {held ? ` · ${DIRECT_GRANT_COPY.alreadyGranted}` : null}
                    </SelectItem>
                  );
                })}
              </SelectGroup>
            </SelectContent>
          </Select>
        </label>
        {heldEntries.length > 0 ? (
          <div
            className="flex flex-col gap-1 text-sm text-text-secondary"
            data-testid="direct-grant-held"
          >
            <p>{DIRECT_GRANT_COPY.alreadyGrantedNote}</p>
            {heldEntries.map(({ grant, candidate }) => (
              <InternalLink
                key={grant.id}
                className="w-fit text-accent-primary underline underline-offset-2"
                href={`/admin/permissions/grants?selected=${grant.id}`}
                onClick={onClose}
              >
                {candidateLabel(candidate, managedSystemNames)} ·{' '}
                {DIRECT_GRANT_COPY.alreadyGrantedLink}
              </InternalLink>
            ))}
          </div>
        ) : null}
        {selectedCandidate?.preflight.state === 'request_review' ? (
          <div className="flex flex-col gap-1 text-sm text-text-secondary">
            <p>{DIRECT_GRANT_COPY.preflightReview}</p>
            <InternalLink
              className="w-fit text-accent-primary underline underline-offset-2"
              href={selectedCandidate.preflight.review_route}
            >
              {DIRECT_GRANT_COPY.reviewLink}
            </InternalLink>
          </div>
        ) : null}
        {selectedCandidate?.preflight.state === 'deny_lift' ? (
          <div className="flex flex-col gap-1 text-sm text-text-secondary">
            <p>{DIRECT_GRANT_COPY.preflightDeny}</p>
            <InternalLink
              className="w-fit text-accent-primary underline underline-offset-2"
              href={selectedCandidate.preflight.lift_route}
              onClick={onClose}
            >
              {DIRECT_GRANT_COPY.denyLink}
            </InternalLink>
          </div>
        ) : null}
        <label className="flex flex-col gap-2 text-sm text-text-secondary" htmlFor={reasonId}>
          {DIRECT_GRANT_COPY.reasonLabel}
          <Textarea
            id={reasonId}
            maxLength={2000}
            value={reason}
            onChange={(event) => clearErrorAndUpdate(() => setReason(event.target.value))}
            placeholder={DIRECT_GRANT_COPY.reasonPlaceholder}
            disabled={mutation.isPending}
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-text-secondary" htmlFor={expirationId}>
          {DIRECT_GRANT_COPY.expirationLabel}
          <DatePicker
            id={expirationId}
            aria-label={DIRECT_GRANT_COPY.expirationLabel}
            value={expirationDate}
            onChange={(value) => clearErrorAndUpdate(() => setExpirationDate(value ?? ''))}
            onValidityChange={setExpirationDraftValid}
            min={minimumExpirationDate()}
            showValidation={expirationInvalid}
            aria-invalid={expirationInvalid}
            disabled={mutation.isPending}
          />
          <span className="text-xs text-text-muted">{DIRECT_GRANT_COPY.expirationHelp}</span>
          <span className="text-xs text-text-muted">{DIRECT_GRANT_COPY.reissueHelp}</span>
        </label>
        {governanceRequired ? (
          <section className="flex flex-col gap-3 rounded-md border border-border-selected bg-surface-field p-3">
            <p className="text-xs leading-5 text-text-secondary">
              {DIRECT_GRANT_COPY.governanceDescription}
            </p>
            <div className="flex items-start gap-2 text-sm text-text-secondary">
              <Checkbox
                id={governanceId}
                checked={governanceConfirmed}
                onCheckedChange={(checked) =>
                  clearErrorAndUpdate(() => setGovernanceConfirmed(checked === true))
                }
                disabled={mutation.isPending}
              />
              <label htmlFor={governanceId} className="cursor-pointer">
                {DIRECT_GRANT_COPY.governanceConfirm}
              </label>
            </div>
          </section>
        ) : null}
        {selfGrantForbidden ? (
          <p className="text-sm text-accent-danger">{DIRECT_GRANT_COPY.selfForbidden}</p>
        ) : null}
        {selfPolicyUnconfirmed ? (
          <p className="text-sm text-accent-danger">{DIRECT_GRANT_COPY.selfPolicyUnavailable}</p>
        ) : null}
        {selfEnvelopeRequired ? (
          <section className="flex flex-col gap-3 rounded-md border border-border-selected bg-surface-field p-3">
            <p className="text-xs font-semibold text-text-primary">
              {DIRECT_GRANT_COPY.selfEnvelopeTitle}
            </p>
            <label
              className="flex flex-col gap-2 text-sm text-text-secondary"
              htmlFor={policyCitationId}
            >
              {DIRECT_GRANT_COPY.policyCitationLabel}
              <Input
                id={policyCitationId}
                value={policyCitation}
                onChange={(event) =>
                  clearErrorAndUpdate(() => setPolicyCitation(event.target.value))
                }
                disabled={mutation.isPending || selfGrantForbidden}
              />
            </label>
            <label
              className="flex flex-col gap-2 text-sm text-text-secondary"
              htmlFor={peerReviewerAbsenceId}
            >
              {DIRECT_GRANT_COPY.peerReviewerAbsenceLabel}
              <Textarea
                id={peerReviewerAbsenceId}
                value={peerReviewerAbsence}
                onChange={(event) =>
                  clearErrorAndUpdate(() => setPeerReviewerAbsence(event.target.value))
                }
                disabled={mutation.isPending || selfGrantForbidden}
                rows={2}
              />
            </label>
          </section>
        ) : null}
        {actorId === null ? (
          <p className="text-xs text-text-muted">{DIRECT_GRANT_COPY.sessionLoading}</p>
        ) : null}
        {mappedError ? (
          <div role="alert" className="flex flex-col gap-1 text-sm text-accent-danger">
            <p>{mappedError}</p>
            {submitErrorDestination ? (
              <InternalLink
                className="w-fit text-accent-primary underline underline-offset-2"
                href={submitErrorDestination.href}
                {...(submitErrorDestination.closesDialog ? { onClick: onClose } : {})}
              >
                {submitErrorDestination.label}
              </InternalLink>
            ) : null}
          </div>
        ) : null}
      </section>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onClose}>
          {DIRECT_GRANT_COPY.cancel}
        </Button>
        <Button
          type="button"
          onClick={submit}
          loading={mutation.isPending}
          disabled={!canSubmit}
          data-testid="direct-grant-submit"
        >
          {DIRECT_GRANT_COPY.submit}
        </Button>
      </DialogFooter>
    </>
  );
}

function roleLevelLabel(roleLevel: PermissionGrantOptions['recipient']['role_level']): string {
  switch (roleLevel) {
    case 'admin':
      return 'Admin';
    case 'developer':
      return 'Developer';
    case 'user':
      return 'User';
  }
}
