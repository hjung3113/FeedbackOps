// Slice 1 #5: functional Request access button.
//
// Generates a stable `Idempotency-Key` per logical intent — the key is
// memoized against `(capability, managedSystemId, attempt)` so a
// double-click, an in-flight React Query retry, or a Cmd-R after a stalled
// response sends the SAME key. The key is rotated to a new UUIDv4 only when
// a previous submission succeeded (ADR-0015:71-90: one key = one intent).
// On success or known-409 conflict the gate's permission-check query and
// the open-requests list query are invalidated so the UI re-renders without
// a manual reload. Other 4xx render an inline error message.
//
// Per AGENTS.md:69 the frontend never enforces backend permissions — this
// component only reacts to server responses.

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
  Textarea,
} from '@fops/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import {
  ApiError,
  type CreatePermissionRequestSuccess,
  createPermissionRequest,
} from '../../../lib/api';
import { permissionCheckQueryKey, permissionRequestsMineKey } from './use-permission-check.js';

export interface RequestAccessButtonProps {
  capability: string;
  managedSystemId?: string;
  returnRouteIntent: string;
  onRequestSubmitted?: () => void;
}

const RECOVERABLE_CONFLICT_CODES = new Set([
  'conflict.capability_already_granted',
  'conflict.permission_request_duplicate',
]);

export function RequestAccessButton(props: RequestAccessButtonProps) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [expiration, setExpiration] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{
    id: string;
    status: string;
    createdAt: string;
    reason: string;
    expiration?: string;
  } | null>(null);
  // Bumping `attempt` rotates the memoized Idempotency-Key, which we do
  // only after a successful submit (a new logical intent). Concurrent
  // clicks / TanStack Query retries within one intent share the same key.
  const [attempt, setAttempt] = useState(0);

  const idempotencyKey = useMemo(
    () => crypto.randomUUID(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.capability, props.managedSystemId, attempt],
  );

  const mutation = useMutation<CreatePermissionRequestSuccess, unknown, void>({
    // Disable React Query's silent retries on this mutation — server-side
    // idempotency reconciliation is the only retry path we honor, and the
    // user explicitly clicks again if they want a new attempt.
    retry: false,
    mutationFn: async () => {
      return await createPermissionRequest(
        {
          requested_capability: props.capability,
          ...(props.managedSystemId !== undefined
            ? { requested_managed_system_id: props.managedSystemId }
            : {}),
          reason: reason.trim(),
          ...(expiration ? { requested_expiration: `${expiration}T23:59:59.000Z` } : {}),
          return_route_intent: props.returnRouteIntent,
        },
        { idempotencyKey },
      );
    },
    onSuccess: async (result) => {
      setErrorMessage(null);
      setSubmitted({
        id: result.id,
        status: result.status,
        createdAt: result.created_at,
        reason: reason.trim(),
        ...(expiration ? { expiration: `${expiration}T23:59:59.000Z` } : {}),
      });
      // Successful submit — rotate the key so a future click counts as a
      // new logical intent.
      setAttempt((n) => n + 1);
      await Promise.all([
        qc.invalidateQueries({
          queryKey: permissionCheckQueryKey({
            capability: props.capability,
            ...(props.managedSystemId !== undefined
              ? { managedSystemId: props.managedSystemId }
              : {}),
          }),
        }),
        qc.invalidateQueries({ queryKey: permissionRequestsMineKey }),
      ]);
      props.onRequestSubmitted?.();
    },
    onError: async (err) => {
      if (err instanceof ApiError && RECOVERABLE_CONFLICT_CODES.has(err.envelope.code)) {
        // Treat as "the world has moved on; recover by refetching." Don't
        // surface an error message; the gate will re-render with the truth.
        setErrorMessage(null);
        await Promise.all([
          qc.invalidateQueries({
            queryKey: permissionCheckQueryKey({
              capability: props.capability,
              ...(props.managedSystemId !== undefined
                ? { managedSystemId: props.managedSystemId }
                : {}),
            }),
          }),
          qc.invalidateQueries({ queryKey: permissionRequestsMineKey }),
        ]);
        return;
      }
      if (err instanceof ApiError) {
        setErrorMessage(err.envelope.message || err.envelope.code);
        return;
      }
      setErrorMessage('Request failed');
    },
  });

  return (
    <div>
      <Button variant="primary" size="md" onClick={() => setOpen(true)}>
        Request access
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="permission-request-dialog">
          {submitted ? (
            <>
              <DialogHeader>
                <DialogTitle>Request submitted</DialogTitle>
                <DialogDescription>
                  Your request is ready for administrator review.
                </DialogDescription>
              </DialogHeader>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
                <dt className="text-text-muted">Request ID</dt>
                <dd className="font-mono text-text-primary" data-testid="permission-request-id">
                  {submitted.id}
                </dd>
                <dt className="text-text-muted">Capability</dt>
                <dd className="font-mono text-text-primary">{props.capability}</dd>
                <dt className="text-text-muted">Managed System</dt>
                <dd className="font-mono text-text-primary">
                  {props.managedSystemId ?? 'Workspace-wide'}
                </dd>
                <dt className="text-text-muted">Reason</dt>
                <dd className="text-text-primary">{submitted.reason}</dd>
                <dt className="text-text-muted">Status</dt>
                <dd className="capitalize text-text-primary">{submitted.status}</dd>
                <dt className="text-text-muted">Created</dt>
                <dd className="text-text-primary">{submitted.createdAt}</dd>
                {submitted.expiration ? (
                  <>
                    <dt className="text-text-muted">Expires</dt>
                    <dd className="text-text-primary">{submitted.expiration}</dd>
                  </>
                ) : null}
              </dl>
              <DialogFooter>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    mutation.reset();
                    setSubmitted(null);
                    setReason('');
                    setExpiration('');
                  }}
                >
                  Request another access
                </Button>
                <Button type="button" onClick={() => setOpen(false)}>
                  Done
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Request access</DialogTitle>
                <DialogDescription>
                  Confirm the permission and explain why you need the least access required.
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-3"
                data-testid="permission-request-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!reason.trim()) {
                    setErrorMessage('Reason is required.');
                    return;
                  }
                  setErrorMessage(null);
                  mutation.mutate();
                }}
              >
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 rounded-md border border-border-subtle bg-surface-card p-3 text-sm">
                  <dt className="text-text-muted">Capability</dt>
                  <dd className="font-mono text-text-primary">{props.capability}</dd>
                  <dt className="text-text-muted">Managed System</dt>
                  <dd className="font-mono text-text-primary">
                    {props.managedSystemId ?? 'Workspace-wide'}
                  </dd>
                </dl>
                <div className="space-y-1">
                  <Label htmlFor="permission-request-reason">Reason · required</Label>
                  <Textarea
                    id="permission-request-reason"
                    maxLength={2000}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    data-testid="permission-request-reason"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="permission-request-expiration">Expiration · optional</Label>
                  <Input
                    id="permission-request-expiration"
                    type="date"
                    value={expiration}
                    onChange={(event) => setExpiration(event.target.value)}
                    data-testid="permission-request-expiration"
                  />
                </div>
                {errorMessage ? (
                  <p role="alert" className="text-sm text-accent-danger">
                    {errorMessage}
                  </p>
                ) : null}
                <DialogFooter>
                  <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={mutation.isPending}>
                    Submit request
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
