// useTriageCommand.ts — command hook for the triage panel (issue #481).
// Owns the undo state machine: composes useUndoableMutation with the triage
// transport, compensation policy, and error policy. TriagePanel calls only
// this hook and keeps panel state + input assembly + toast UI.
//
// Call-order contract (design §3):
//   - the PANEL handler fires onOptimisticRemove BEFORE commit() and holds
//     the panelLocked guard before the remove;
//   - snapshot() runs synchronously inside mutate() before the PATCH starts,
//     so it still sees the pre-auto-advance voc row;
//   - abort (undo of an in-flight call) restores the row immediately;
//   - compensation restores the row only after the compensating PATCH
//     resolves.

import type { VocListItem } from '@fops/shared';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { toast } from 'sonner';
import { runTriageCompensation } from '../lib/triage-compensation';
import {
  COMPENSATE_FAILURE_TOAST,
  REFETCH_FAILURE_TOAST,
  classifyTriageMutationError,
  isRefetchFailure,
} from '../lib/triage-error-policy';
import { buildTriageSnapshot } from '../lib/triage-payload';
import { patchVocTriage } from '../lib/triage-transport';
import type { TriageInput, TriageOutput, TriageSnapshot } from '../lib/triage-types';
import { type CallToken, useUndoableMutation } from './useUndoableMutation';

export interface UseTriageCommandArgs {
  voc: VocListItem;
  onOptimisticRestore?: ((vocId: string) => void) | undefined;
}

export interface UseTriageCommandResult {
  panelLocked: boolean;
  isSubmitting: boolean;
  commit: (input: TriageInput) => CallToken;
  undoLast: (token?: CallToken) => void;
}

export function useTriageCommand({
  voc,
  onOptimisticRestore,
}: UseTriageCommandArgs): UseTriageCommandResult {
  const queryClient = useQueryClient();

  // Panel-level lock for idempotency_key_reuse (per spec §5.3 + PLAN-21 §307)
  const [panelLocked, setPanelLocked] = React.useState(false);

  // Stable ref so the hook callbacks always see the latest restore handler.
  // We deliberately do NOT keep a ref to voc.id here: VocTriageScreen
  // auto-advances the selected VOC after optimistic remove, so a vocIdRef would
  // point at the NEXT row by the time onError/onAbort fires (REV-1 #5). All
  // queue side-effects must close over the original mutation input instead.
  const onOptimisticRestoreRef = React.useRef(onOptimisticRestore);
  onOptimisticRestoreRef.current = onOptimisticRestore;

  const {
    mutate: undoableMutate,
    undoLast,
    state: mutationState,
  } = useUndoableMutation<TriageInput, TriageOutput, TriageSnapshot>({
    // The signal goes to the forward PATCH only — never to the refetch or the
    // compensating PATCH (issue #481 risk 2: an in-flight undo has already
    // aborted the controller, so a late resolve would otherwise fail the
    // compensation path).
    mutationFn: (input: TriageInput, signal?: AbortSignal): Promise<TriageOutput> =>
      patchVocTriage(input, { ...(signal !== undefined && { signal }) }),
    // REV-1 #3: snapshot from the PRIOR voc values (what compensate must
    // restore the VOC to), NOT from staged panelState (the new values the
    // user just chose). If we snapshot staged values, the compensating
    // PATCH writes the new values back with triage_state='untriaged' and
    // permanently mutates severity/owner/AA.
    snapshot: (input: TriageInput): TriageSnapshot =>
      buildTriageSnapshot(input, {
        severity: voc.severity,
        ownerUserId: voc.owner_user_id,
        ownerTeamId: voc.owner_team_id,
        analyticsAreaId: voc.analytics_area_id,
      }),
    compensateFn: async (snapshot: TriageSnapshot, output: TriageOutput | null) => {
      try {
        await runTriageCompensation({
          queryClient,
          snapshot,
          output,
          restore: (vocId: string) => {
            onOptimisticRestoreRef.current?.(vocId);
          },
        });
      } catch (err) {
        // REV-4 case 1: the refetch-failure toast fires exactly once, here —
        // BEFORE the rethrow; onCompensateError sees the __refetchFailure tag
        // and skips so the user never sees the toast twice.
        if (isRefetchFailure(err)) {
          toast.error(REFETCH_FAILURE_TOAST);
        }
        throw err;
      }
    },
    // REV-1 #1: when the user undoes while the PATCH is still in-flight,
    // useUndoableMutation aborts the controller and fires onAbort with the
    // original input. Restore the row to the queue using that input — never
    // current props, which may already point at the auto-advanced VOC.
    // No compensating PATCH here: restore is immediate, not server-gated.
    onAbort: (input: TriageInput) => {
      onOptimisticRestoreRef.current?.(input.vocId);
    },
    // REV-4: surface a toast when compensateFn rejects. Two paths land here:
    //   a) Refetch failure — compensateFn already toasted and tagged the
    //      error with __refetchFailure; skip toasting again here.
    //   b) Compensating PATCH failure (e.g. 409) — toast the generic undo error.
    onCompensateError: (err: unknown) => {
      if (isRefetchFailure(err)) {
        // Already toasted by the compensateFn catch block.
        return;
      }
      toast.error(COMPENSATE_FAILURE_TOAST);
    },
    // Error matrix (PLAN-21 §302-307): handle via onError so we get the actual error object.
    // REV-1 #5: use the original input.vocId (closure on the failing mutate call),
    // never vocIdRef.current — VocTriageScreen auto-advances the selected VOC after
    // optimistic remove, so vocIdRef.current points at the NEXT row, not the failed one.
    onError: (err: unknown, input: TriageInput) => {
      const decision = classifyTriageMutationError(err);
      if (decision.restore) {
        onOptimisticRestoreRef.current?.(input.vocId);
      }
      if (decision.lockPanel) {
        setPanelLocked(true);
      }
      if (decision.toast.level === 'warning') {
        toast.warning(decision.toast.message);
      } else {
        toast.error(decision.toast.message);
      }
    },
  });

  // Unlock panel when voc changes (per spec: lock until VOC switch)
  // biome-ignore lint/correctness/useExhaustiveDependencies: voc.id is the reset trigger for switching panels.
  React.useEffect(() => {
    setPanelLocked(false);
  }, [voc.id]);

  return {
    panelLocked,
    isSubmitting: mutationState === 'pending',
    // commit returns the per-call token unchanged so the panel's toast can
    // bind its undo to THIS call only (REV-3 Cluster X). The hook does not
    // perform optimistic remove or own the UndoToast.
    commit: undoableMutate,
    undoLast,
  };
}
