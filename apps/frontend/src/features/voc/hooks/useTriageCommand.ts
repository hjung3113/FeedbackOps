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
//   - undo of an in-flight call restores the row immediately. The forward
//     PATCH is never aborted (#857): an abort cannot un-send a request;
//   - when that PATCH succeeds, a compensating PATCH follows, whether undo
//     came before or after it settled. When it fails, nothing is compensated;
//   - compensation restores the row only after the compensating PATCH
//     resolves.

import { ApiError } from '@/lib/api';
import { invalidateNavCounts } from '@/lib/query/navCounts';
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
  onProcessed?: ((delta: 1 | -1) => void) | undefined;
  onOptimisticRestore?: ((vocId: string) => void) | undefined;
}

export interface UseTriageCommandResult {
  panelLocked: boolean;
  isSubmitting: boolean;
  commit: (input: TriageInput, onFailure?: () => void) => CallToken;
  undoLast: (token?: CallToken) => void;
}

export function useTriageCommand({
  voc,
  onOptimisticRestore,
  onProcessed,
}: UseTriageCommandArgs): UseTriageCommandResult {
  const queryClient = useQueryClient();
  const countedRef = React.useRef(new WeakSet<TriageInput>());
  const undoneRef = React.useRef(new WeakSet<TriageInput>());
  const failuresRef = React.useRef(new WeakMap<TriageInput, () => void>());
  const invalidateTriageLists = () => {
    void queryClient.invalidateQueries({ queryKey: ['vocs', 'triage'] });
  };

  // Panel-level lock for idempotency_key_reuse (per spec §5.3 + PLAN-21 §307)
  const [panelLocked, setPanelLocked] = React.useState(false);

  // Stable ref so the hook callbacks always see the latest restore handler.
  // We deliberately do NOT keep a ref to voc.id here: VocTriageScreen
  // auto-advances the selected VOC after optimistic remove, so a vocIdRef would
  // point at the NEXT row by the time onError/onAbort fires (REV-1 #5). All
  // queue side-effects must close over the original mutation input instead.
  const onProcessedRef = React.useRef(onProcessed);
  onProcessedRef.current = onProcessed;

  const onOptimisticRestoreRef = React.useRef(onOptimisticRestore);
  onOptimisticRestoreRef.current = onOptimisticRestore;

  const {
    mutate: undoableMutate,
    undoLast,
    state: mutationState,
  } = useUndoableMutation<TriageInput, TriageOutput, TriageSnapshot & { input: TriageInput }>({
    // No AbortSignal. An abort cannot un-send a forward PATCH the server may
    // already have committed (#857). The refetch and the compensating PATCH
    // are likewise not tied to the forward call's lifetime.
    mutationFn: async (input: TriageInput): Promise<TriageOutput> => {
      try {
        const output = await patchVocTriage(input);
        if (!undoneRef.current.has(input)) {
          countedRef.current.add(input);
          onProcessedRef.current?.(1);
        }
        invalidateNavCounts(queryClient);
        invalidateTriageLists();
        return output;
      } catch (err) {
        failuresRef.current.get(input)?.();
        if (err instanceof ApiError && err.code === 'conflict.stale_write') {
          invalidateTriageLists();
        }
        throw err;
      } finally {
        failuresRef.current.delete(input);
      }
    },
    // REV-1 #3: snapshot from the PRIOR voc values (what compensate must
    // restore the VOC to), NOT from staged panelState (the new values the
    // user just chose). If we snapshot staged values, the compensating
    // PATCH writes the new values back with triage_state='untriaged' and
    // permanently mutates severity/owner/AA.
    snapshot: (input: TriageInput) => ({
      ...buildTriageSnapshot(input, {
        severity: voc.severity,
        ownerUserId: voc.owner_user_id,
        ownerTeamId: voc.owner_team_id,
        analyticsAreaId: voc.analytics_area_id,
      }),
      input,
    }),
    compensateFn: async (snapshot, output: TriageOutput | null) => {
      try {
        await runTriageCompensation({
          queryClient,
          snapshot,
          output,
          restore: (vocId: string) => {
            onOptimisticRestoreRef.current?.(vocId);
            if (countedRef.current.delete(snapshot.input)) {
              onProcessedRef.current?.(-1);
            }
          },
        });
        invalidateNavCounts(queryClient);
        invalidateTriageLists();
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
    // REV-1 #1: when the user undoes while the PATCH is still in-flight, the
    // hook fires onAbort with the original input and leaves the request
    // running (#857). Restore the row from that input — never current props,
    // which may already point at the auto-advanced VOC. Compensation runs
    // later, only if the forward PATCH succeeds.
    onAbort: (input: TriageInput) => {
      undoneRef.current.add(input);
      onOptimisticRestoreRef.current?.(input.vocId);
      invalidateTriageLists();
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

  // Reset the VOC-specific lock before committing a newly selected panel.
  const [lockVocId, setLockVocId] = React.useState(voc.id);
  if (lockVocId !== voc.id) {
    setLockVocId(voc.id);
    setPanelLocked(false);
  }

  return {
    panelLocked,
    isSubmitting: mutationState === 'pending',
    // commit returns the per-call token unchanged so the panel's toast can
    // bind its undo to THIS call only (REV-3 Cluster X). The hook does not
    // perform optimistic remove or own the UndoToast.
    commit: (input, onFailure) => {
      if (onFailure) failuresRef.current.set(input, onFailure);
      return undoableMutate(input);
    },
    undoLast,
  };
}
