import {
  ApiError,
  fetchManagedSystems,
  fetchPermissionRequestOwnerDetail,
  permissionRequestAdminDetailKey,
  permissionRequestOwnerDetailKey,
  updateOwnPermissionRequest,
  withdrawPermissionRequest,
} from '@/lib/api';
import { mapUnknownError } from '@/lib/api/errorMapper';
import { mintIdempotencyKey } from '@/lib/api/idempotency';
import { getCapabilityDisplayLabel } from '@/lib/copy/capabilities';
import { HOME_PERMISSION_COPY as COPY } from '@/lib/copy/home';
import { permissionRequestsMineKey } from '@/lib/cross-system/usePermissionCheck';
import { formatDateOnly } from '@/lib/format/datetime';
import { shortId } from '@/lib/identity';
import type { PermissionRequestOwnerDetail } from '@fops/shared';
import {
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@fops/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { toast } from 'sonner';

export function OwnerPermissionRequestDialog({
  id,
  onClose,
}: {
  id: string;
  onClose: (options?: { removed?: boolean }) => void;
}) {
  const query = useQuery({
    queryKey: permissionRequestOwnerDetailKey(id),
    queryFn: ({ signal }) => fetchPermissionRequestOwnerDetail(id, signal),
    retry: false,
    staleTime: 0,
  });
  // UX: requesters read scope as system names elsewhere (sidebar, Admin detail);
  // the shipped ['managed-systems', 'all'] lookup resolves them, short ID only as fallback.
  const managedSystems = useQuery({
    queryKey: ['managed-systems', 'all'] as const,
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived: true, signal }),
    retry: false,
    staleTime: 10 * 60 * 1000,
  });
  const managedSystemNames = Object.fromEntries(
    (managedSystems.data?.items ?? []).map((system) => [system.id, system.name]),
  );
  const [pending, setPending] = React.useState(false);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90vh] overflow-y-auto"
        data-testid="owner-permission-request-dialog"
      >
        <DialogHeader>
          <DialogTitle>{COPY.title}</DialogTitle>
          <DialogDescription>{COPY.description}</DialogDescription>
        </DialogHeader>
        {query.data && query.isFetchedAfterMount ? (
          <OwnerForm
            detail={query.data}
            managedSystemNames={managedSystemNames}
            readFailed={query.isError}
            refreshing={query.isFetching}
            refresh={() => query.refetch()}
            onClose={onClose}
            onPending={setPending}
          />
        ) : (
          <>
            <p role={query.isError ? 'alert' : 'status'}>
              {query.isError ? COPY.loadError : COPY.loading}
            </p>
            {query.isError ? (
              <Button onClick={() => void query.refetch()}>{COPY.retry}</Button>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function OwnerForm({
  detail,
  managedSystemNames,
  readFailed,
  refreshing,
  refresh,
  onClose,
  onPending,
}: {
  detail: PermissionRequestOwnerDetail;
  managedSystemNames: Record<string, string>;
  readFailed: boolean;
  refreshing: boolean;
  refresh: () => Promise<unknown>;
  onClose: (options?: { removed?: boolean }) => void;
  onPending: (pending: boolean) => void;
}) {
  const qc = useQueryClient();
  const [baseline, setBaseline] = React.useState(detail);
  const [reason, setReason] = React.useState(detail.reason);
  const [scope, setScope] = React.useState(detail.requested_managed_system_id ?? 'workspace');
  const [expirationMode, setExpirationMode] = React.useState('keep');
  const [date, setDate] = React.useState(detail.requested_expiration?.slice(0, 10) ?? '');
  const [dateValid, setDateValid] = React.useState(true);
  const [withdrawReason, setWithdrawReason] = React.useState('');
  const [withdrawConfirm, setWithdrawConfirm] = React.useState(false);
  const [returnToWithdrawTrigger, setReturnToWithdrawTrigger] = React.useState(false);
  const [stale, setStale] = React.useState(false);
  const [validation, setValidation] = React.useState<{
    field: 'reason' | 'expiration';
    message: string;
  } | null>(null);
  const focusTarget = React.useRef<HTMLElement | null>(null);
  const reasonRef = React.useRef<HTMLTextAreaElement>(null);
  const withdrawReasonRef = React.useRef<HTMLTextAreaElement>(null);
  const staleAlertRef = React.useRef<HTMLParagraphElement>(null);
  const validationRef = React.useRef<HTMLParagraphElement>(null);
  const withdrawTriggerRef = React.useRef<HTMLButtonElement>(null);
  const intent = React.useRef<{ fingerprint: string; key: string } | null>(null);
  const submitting = React.useRef(false);
  const mounted = React.useRef(true);
  const systemName = (managedSystemId: string): string =>
    managedSystemNames[managedSystemId] ?? `Managed System · ${shortId(managedSystemId)}`;
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const reconcileRequired = stale || detail.revision !== baseline.revision;
  const mutation = useMutation({
    retry: false,
    mutationFn: async (args: {
      action: 'edit' | 'supplement' | 'withdraw';
      body: {
        expected_revision: number;
        reason?: string;
        requested_managed_system_id?: string | null;
        requested_expiration?: string | null;
      };
      key: string;
    }) =>
      args.action === 'withdraw'
        ? withdrawPermissionRequest(detail.id, args.body, args.key)
        : updateOwnPermissionRequest(detail.id, args.action, args.body, args.key),
    onSuccess: async (result, variables) => {
      toast.success(
        variables.action === 'edit'
          ? COPY.editSaved
          : variables.action === 'supplement'
            ? COPY.supplementSent
            : COPY.withdrawn,
      );
      if (result.status === 'cancelled')
        qc.setQueryData<{ requests: Array<{ id: string }> }>(permissionRequestsMineKey, (old) =>
          old ? { ...old, requests: old.requests.filter((row) => row.id !== result.id) } : old,
        );
      if (mounted.current) onClose(result.status === 'cancelled' ? { removed: true } : undefined);
      await Promise.all([
        qc.invalidateQueries({ queryKey: permissionRequestsMineKey }),
        qc.invalidateQueries({ queryKey: permissionRequestOwnerDetailKey(detail.id) }),
        qc.invalidateQueries({ queryKey: permissionRequestAdminDetailKey(detail.id) }),
        qc.invalidateQueries({ queryKey: ['permission-requests', 'review'] }),
        qc.invalidateQueries({ queryKey: ['dashboard-summary'] }),
        qc.invalidateQueries({ queryKey: ['permission-check'] }),
        qc.invalidateQueries({ queryKey: ['managed-system-scope'] }),
      ]);
    },
    onError: async (error) => {
      if (!mounted.current) return;
      // Focus is restored by the effect below once the error render has
      // cleared `isPending`; calling .focus() here hits a still-disabled field.
      if (error instanceof ApiError && error.code === 'conflict.stale_write') {
        setStale(true);
        // Reconciliation needs the edit fields mounted; the confirmation
        // replaces them, so it yields to the stale comparison.
        setWithdrawConfirm(false);
        await Promise.all([
          refresh(),
          qc.invalidateQueries({ queryKey: permissionRequestsMineKey }),
          qc.invalidateQueries({ queryKey: permissionRequestAdminDetailKey(detail.id) }),
          qc.invalidateQueries({ queryKey: ['permission-requests', 'review'] }),
          qc.invalidateQueries({ queryKey: ['permission-check'] }),
          qc.invalidateQueries({ queryKey: ['managed-system-scope'] }),
          qc.invalidateQueries({ queryKey: ['dashboard-summary'] }),
        ]);
      }
    },
    onSettled: () => {
      submitting.current = false;
      if (mounted.current) onPending(false);
    },
  });
  const blocked =
    reconcileRequired || readFailed || refreshing || mutation.isPending || mutation.isSuccess;
  // CR: a committed server error arrives after `isPending` cleared, so the
  // edited field can receive focus again; stale conflicts focus the stale
  // notice instead (effect below). The Select trigger is a BUTTON, so it is
  // tracked separately from INPUT/TEXTAREA (container onFocus); when no
  // tracked element survives, the error message takes focus.
  React.useEffect(() => {
    if (mutation.error === undefined) return;
    if (mutation.error instanceof ApiError && mutation.error.code === 'conflict.stale_write')
      return;
    const target = focusTarget.current;
    if (target?.isConnected) target.focus();
    else validationRef.current?.focus();
  }, [mutation.error]);
  // Focus the stale notice when reconciliation becomes required.
  React.useEffect(() => {
    if (reconcileRequired) staleAlertRef.current?.focus();
  }, [reconcileRequired]);
  // Focus the withdrawal reason when the confirmation opens.
  React.useEffect(() => {
    if (withdrawConfirm) withdrawReasonRef.current?.focus();
  }, [withdrawConfirm]);
  // 취소 remounts the footer, so the opener button gets focus on the next
  // commit instead of losing it with the unmounted confirmation.
  React.useEffect(() => {
    if (!withdrawConfirm && returnToWithdrawTrigger) {
      setReturnToWithdrawTrigger(false);
      withdrawTriggerRef.current?.focus();
    }
  }, [withdrawConfirm, returnToWithdrawTrigger]);
  const editable =
    baseline.allowed_actions.includes('edit') || baseline.allowed_actions.includes('supplement');
  const expirationDraft =
    expirationMode === 'clear'
      ? null
      : expirationMode === 'change'
        ? `${date}T23:59:59.000Z`
        : baseline.requested_expiration;
  function submit(action: 'edit' | 'supplement' | 'withdraw') {
    if (blocked || submitting.current || !detail.allowed_actions.includes(action)) return;
    if (action !== 'withdraw' && !reason.trim()) {
      setValidation({ field: 'reason', message: COPY.invalidReason });
      reasonRef.current?.focus();
      return;
    }
    if (
      action !== 'withdraw' &&
      expirationMode === 'change' &&
      (!dateValid ||
        !date ||
        !Number.isFinite(Date.parse(expirationDraft ?? '')) ||
        Date.parse(expirationDraft ?? '') <= Date.now())
    ) {
      setValidation({ field: 'expiration', message: COPY.invalidExpiration });
      document.getElementById('owner-request-expiry')?.focus();
      return;
    }
    const body = {
      expected_revision: baseline.revision,
      ...(action === 'withdraw' && withdrawReason.trim() ? { reason: withdrawReason.trim() } : {}),
      ...(action !== 'withdraw' && reason.trim() !== baseline.reason
        ? { reason: reason.trim() }
        : {}),
      ...(action !== 'withdraw' && scope !== (baseline.requested_managed_system_id ?? 'workspace')
        ? { requested_managed_system_id: scope === 'workspace' ? null : scope }
        : {}),
      ...(action !== 'withdraw' && expirationDraft !== baseline.requested_expiration
        ? { requested_expiration: expirationDraft }
        : {}),
    };
    const fingerprint = JSON.stringify({ id: detail.id, action, body });
    if (intent.current?.fingerprint !== fingerprint)
      intent.current = { fingerprint, key: mintIdempotencyKey() };
    submitting.current = true;
    onPending(true);
    setValidation(null);
    mutation.mutate({ action, body, key: intent.current.key });
  }
  // A no-op command must not reach the server: it would bump the revision and
  // wipe every Admin draft on this request for a change that never happened.
  const dirty =
    reason.trim() !== baseline.reason ||
    scope !== (baseline.requested_managed_system_id ?? 'workspace') ||
    expirationDraft !== baseline.requested_expiration;
  // Supplementation answers the Admin question, and the answer lives in 사유:
  // a scope/expiry-only change is not an answer, so 보완 제출 stays blocked
  // until the reason differs from the baseline. 수정 keeps the general
  // field-change predicate above.
  const answered = reason.trim() !== baseline.reason;
  // One stale message at a time: while the stale section renders, the generic
  // conflict error line is suppressed in its favour.
  const validationMessage =
    validation?.message ??
    (mutation.error && !reconcileRequired ? mapUnknownError(mutation.error).message : null);
  return (
    <div
      className="space-y-3"
      onFocus={(event) => {
        if (
          event.target instanceof HTMLElement &&
          (['INPUT', 'TEXTAREA'].includes(event.target.tagName) ||
            event.target.id === 'owner-request-scope')
        )
          focusTarget.current = event.target;
      }}
    >
      <p className="text-sm font-medium">
        {getCapabilityDisplayLabel(detail.requested_capability)}
      </p>
      <p className="text-xs text-text-muted">
        {COPY.expiration} ·{' '}
        {detail.requested_expiration
          ? formatDateOnly(detail.requested_expiration.slice(0, 10))
          : COPY.clear}
      </p>
      {detail.latest_admin_question ? (
        <section className="rounded-md border border-border-subtle bg-surface-card p-3">
          <h3 className="text-sm font-medium">{COPY.question}</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm">{detail.latest_admin_question.note}</p>
          {detail.allowed_actions.includes('supplement') ? (
            <p className="mt-2 text-xs text-text-muted">{COPY.questionHint}</p>
          ) : null}
        </section>
      ) : null}
      {editable && !withdrawConfirm ? (
        <>
          <Label htmlFor="owner-request-reason">{COPY.reason}</Label>
          <Textarea
            id="owner-request-reason"
            ref={reasonRef}
            value={reason}
            maxLength={2000}
            onChange={(event) => setReason(event.target.value)}
            disabled={mutation.isPending}
            {...(validation?.field === 'reason'
              ? { 'aria-invalid': true, 'aria-describedby': 'owner-request-validation' }
              : {})}
          />
          <Label htmlFor="owner-request-scope">{COPY.scope}</Label>
          <Select value={scope} onValueChange={setScope} disabled={mutation.isPending}>
            <SelectTrigger id="owner-request-scope" aria-label={COPY.scope}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {detail.editable_scope_candidates.map((candidate) => (
                  <SelectItem
                    key={candidate.managed_system_id ?? 'workspace'}
                    value={candidate.managed_system_id ?? 'workspace'}
                  >
                    {candidate.managed_system_id
                      ? systemName(candidate.managed_system_id)
                      : '워크스페이스 전체'}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <RadioGroup
            aria-label={COPY.expiration}
            value={expirationMode}
            onValueChange={setExpirationMode}
            disabled={mutation.isPending}
          >
            {(['keep', 'change', 'clear'] as const).map((mode) => (
              <div key={mode} className="flex items-center gap-2">
                <RadioGroupItem id={`owner-expiry-${mode}`} value={mode} />
                <label htmlFor={`owner-expiry-${mode}`}>{COPY[mode]}</label>
              </div>
            ))}
          </RadioGroup>
          <DatePicker
            id="owner-request-expiry"
            aria-label={COPY.newExpiration}
            value={date}
            onChange={(value) => setDate(value ?? '')}
            onValidityChange={setDateValid}
            disabled={expirationMode !== 'change' || mutation.isPending}
            {...(validation?.field === 'expiration'
              ? { 'aria-invalid': true, 'aria-describedby': 'owner-request-validation' }
              : {})}
          />
        </>
      ) : null}
      {detail.allowed_actions.length === 0 ? (
        <output className="block">{COPY.closedRequest}</output>
      ) : null}
      {readFailed ? <p role="alert">{COPY.loadError}</p> : null}
      {validationMessage ? (
        <p
          id="owner-request-validation"
          ref={validationRef}
          role="alert"
          tabIndex={-1}
          className="text-sm text-accent-danger"
        >
          {validationMessage}
        </p>
      ) : null}
      {reconcileRequired ? (
        <section className="space-y-2">
          <p ref={staleAlertRef} role="alert" tabIndex={-1} className="outline-hidden">
            {COPY.stale}
          </p>
          <p className="whitespace-pre-wrap text-sm">
            {COPY.latestReason} · {detail.reason}
          </p>
          <p className="text-sm">
            {COPY.scope} ·{' '}
            {detail.requested_managed_system_id
              ? systemName(detail.requested_managed_system_id)
              : '워크스페이스 전체'}
          </p>
          <Button
            disabled={readFailed || refreshing}
            onClick={() => {
              setBaseline(detail);
              setStale(false);
              setWithdrawConfirm(false);
              intent.current = null;
              mutation.reset();
              reasonRef.current?.focus();
            }}
          >
            {COPY.reconcile}
          </Button>
        </section>
      ) : null}
      {readFailed ? <Button onClick={() => void refresh()}>{COPY.retry}</Button> : null}
      {withdrawConfirm ? (
        <section className="space-y-2" data-testid="owner-withdraw-confirmation">
          <h3 className="text-sm font-medium">{COPY.withdrawConfirm}</h3>
          <p className="text-sm">{COPY.withdrawDescription}</p>
          <Label htmlFor="owner-withdraw-reason">{COPY.withdrawReason}</Label>
          <Textarea
            id="owner-withdraw-reason"
            ref={withdrawReasonRef}
            value={withdrawReason}
            maxLength={2000}
            disabled={mutation.isPending}
            onChange={(event) => setWithdrawReason(event.target.value)}
          />
          <DialogFooter>
            <Button
              variant="secondary"
              disabled={mutation.isPending}
              onClick={() => {
                setReturnToWithdrawTrigger(true);
                setWithdrawConfirm(false);
              }}
            >
              {COPY.cancel}
            </Button>
            <Button disabled={blocked} onClick={() => submit('withdraw')}>
              {COPY.withdraw}
            </Button>
          </DialogFooter>
        </section>
      ) : (
        <DialogFooter>
          {editable && !dirty ? (
            <span className="mr-auto self-center text-xs text-text-muted">{COPY.noChanges}</span>
          ) : null}
          <Button
            data-testid="owner-request-close"
            variant="secondary"
            disabled={mutation.isPending}
            onClick={() => onClose()}
          >
            {COPY.close}
          </Button>
          {detail.allowed_actions.includes('withdraw') ? (
            <Button
              ref={withdrawTriggerRef}
              variant="ghost"
              disabled={blocked}
              onClick={() => setWithdrawConfirm(true)}
            >
              {COPY.withdraw}
            </Button>
          ) : null}
          {detail.allowed_actions.includes('edit') ? (
            <Button
              variant={reconcileRequired ? 'secondary' : 'primary'}
              disabled={blocked || !dirty}
              onClick={() => submit('edit')}
            >
              {COPY.edit}
            </Button>
          ) : null}
          {detail.allowed_actions.includes('supplement') ? (
            <Button
              variant={reconcileRequired ? 'secondary' : 'primary'}
              disabled={blocked || !answered}
              onClick={() => submit('supplement')}
            >
              {COPY.supplement}
            </Button>
          ) : null}
        </DialogFooter>
      )}
    </div>
  );
}
