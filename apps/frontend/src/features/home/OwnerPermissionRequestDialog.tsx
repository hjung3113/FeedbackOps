import {
  ApiError,
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

export function OwnerPermissionRequestDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const query = useQuery({
    queryKey: permissionRequestOwnerDetailKey(id),
    queryFn: ({ signal }) => fetchPermissionRequestOwnerDetail(id, signal),
    retry: false,
    staleTime: 0,
  });
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
  readFailed,
  refreshing,
  refresh,
  onClose,
  onPending,
}: {
  detail: PermissionRequestOwnerDetail;
  readFailed: boolean;
  refreshing: boolean;
  refresh: () => Promise<unknown>;
  onClose: () => void;
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
  const [stale, setStale] = React.useState(false);
  const [validation, setValidation] = React.useState<string | null>(null);
  const focusTarget = React.useRef<HTMLElement | null>(null);
  const intent = React.useRef<{ fingerprint: string; key: string } | null>(null);
  const submitting = React.useRef(false);
  const mounted = React.useRef(true);
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
    onSuccess: async (result) => {
      if (result.status === 'cancelled')
        qc.setQueryData<{ requests: Array<{ id: string }> }>(permissionRequestsMineKey, (old) =>
          old ? { ...old, requests: old.requests.filter((row) => row.id !== result.id) } : old,
        );
      if (mounted.current) onClose();
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
      focusTarget.current?.focus();
      if (error instanceof ApiError && error.code === 'conflict.stale_write') {
        setStale(true);
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
  function submit(action: 'edit' | 'supplement' | 'withdraw') {
    if (blocked || submitting.current || !detail.allowed_actions.includes(action)) return;
    if (action !== 'withdraw' && !reason.trim()) {
      setValidation(COPY.invalidReason);
      return;
    }
    const expiration =
      expirationMode === 'clear'
        ? null
        : expirationMode === 'change'
          ? `${date}T23:59:59.000Z`
          : baseline.requested_expiration;
    if (
      action !== 'withdraw' &&
      expirationMode === 'change' &&
      (!dateValid ||
        !date ||
        !Number.isFinite(Date.parse(expiration ?? '')) ||
        Date.parse(expiration ?? '') <= Date.now())
    ) {
      setValidation(COPY.invalidExpiration);
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
      ...(action !== 'withdraw' && expiration !== baseline.requested_expiration
        ? { requested_expiration: expiration }
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
  const editable =
    baseline.allowed_actions.includes('edit') || baseline.allowed_actions.includes('supplement');
  return (
    <div
      className="space-y-3"
      onFocus={(event) => {
        if (
          event.target instanceof HTMLElement &&
          ['INPUT', 'TEXTAREA'].includes(event.target.tagName)
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
        <section>
          <h3 className="text-sm font-medium">{COPY.question}</h3>
          <p className="whitespace-pre-wrap text-sm">{detail.latest_admin_question.note}</p>
        </section>
      ) : null}
      {editable ? (
        <>
          <Label htmlFor="owner-request-reason">{COPY.reason}</Label>
          <Textarea
            id="owner-request-reason"
            value={reason}
            maxLength={2000}
            onChange={(event) => setReason(event.target.value)}
            disabled={mutation.isPending}
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
                      ? `Managed System · ${shortId(candidate.managed_system_id)}`
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
            aria-label={COPY.newExpiration}
            value={date}
            onChange={(value) => setDate(value ?? '')}
            onValidityChange={setDateValid}
            disabled={expirationMode !== 'change' || mutation.isPending}
          />
        </>
      ) : null}
      {detail.allowed_actions.length === 0 ? (
        <output className="block">{COPY.closedRequest}</output>
      ) : null}
      {readFailed ? <p role="alert">{COPY.loadError}</p> : null}
      {validation || mutation.error ? (
        <p role="alert" className="text-sm text-accent-danger">
          {validation ?? mapUnknownError(mutation.error).message}
        </p>
      ) : null}
      {reconcileRequired ? (
        <section className="space-y-2">
          <p role="alert">{COPY.stale}</p>
          <p className="whitespace-pre-wrap text-sm">
            {COPY.latestReason} · {detail.reason}
          </p>
          <p className="text-sm">
            {COPY.scope} ·{' '}
            {detail.requested_managed_system_id
              ? `Managed System · ${shortId(detail.requested_managed_system_id)}`
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
            value={withdrawReason}
            maxLength={2000}
            disabled={mutation.isPending}
            onChange={(event) => setWithdrawReason(event.target.value)}
          />
          <Button
            variant="secondary"
            disabled={mutation.isPending}
            onClick={() => setWithdrawConfirm(false)}
          >
            {COPY.close}
          </Button>
          <Button disabled={blocked} onClick={() => submit('withdraw')}>
            {COPY.withdraw}
          </Button>
        </section>
      ) : (
        <DialogFooter>
          <Button
            data-testid="owner-request-close"
            variant="secondary"
            disabled={mutation.isPending}
            onClick={onClose}
          >
            {COPY.close}
          </Button>
          {detail.allowed_actions.includes('withdraw') ? (
            <Button variant="ghost" disabled={blocked} onClick={() => setWithdrawConfirm(true)}>
              {COPY.withdraw}
            </Button>
          ) : null}
          {detail.allowed_actions.includes('edit') ? (
            <Button disabled={blocked} onClick={() => submit('edit')}>
              {COPY.edit}
            </Button>
          ) : null}
          {detail.allowed_actions.includes('supplement') ? (
            <Button disabled={blocked} onClick={() => submit('supplement')}>
              {COPY.supplement}
            </Button>
          ) : null}
        </DialogFooter>
      )}
    </div>
  );
}
