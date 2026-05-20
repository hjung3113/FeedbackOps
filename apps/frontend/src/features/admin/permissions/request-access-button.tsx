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

import { Button } from '@fops/ui';
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
  onRequestSubmitted?: () => void;
}

const RECOVERABLE_CONFLICT_CODES = new Set([
  'conflict.capability_already_granted',
  'conflict.permission_request_duplicate',
]);

export function RequestAccessButton(props: RequestAccessButtonProps) {
  const qc = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
          reason: 'Requested via permission gate',
        },
        { idempotencyKey },
      );
    },
    onSuccess: async () => {
      setErrorMessage(null);
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
    <div className="space-y-2">
      <Button
        variant="primary"
        size="md"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        Request access
      </Button>
      {errorMessage && (
        <p role="alert" className="text-sm text-accent-danger">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
