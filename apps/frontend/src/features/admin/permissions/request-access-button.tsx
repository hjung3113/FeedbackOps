// Slice 1 #5: functional Request access button.
//
// Generates a fresh UUIDv4 `Idempotency-Key` per click and POSTs to
// `/permission-requests`. On success or known-409 conflict it invalidates
// both the permission-check query (so the gate re-renders as
// pending_request) and the open-requests list query (so the home page list
// updates without a reload). Other 4xx render an inline error message.
//
// Per AGENTS.md:69 the frontend never enforces backend permissions — this
// component only reacts to server responses.

import { Button } from '@fops/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  ApiError,
  type CreatePermissionRequestSuccess,
  createPermissionRequest,
} from '../../../lib/api.js';
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

  const mutation = useMutation<CreatePermissionRequestSuccess, unknown, void>({
    mutationFn: async () => {
      const idempotencyKey = crypto.randomUUID();
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
