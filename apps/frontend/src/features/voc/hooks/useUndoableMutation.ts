// useUndoableMutation.ts — Generic undo-able mutation hook.
//
// Signature:
//   const { mutate, compensate, undoLast, state } = useUndoableMutation<TInput, TOutput>({
//     mutationFn,   // (input: TInput) => Promise<TOutput>
//     snapshot,     // (input: TInput) => TSnapshot  — captures rollback data
//     compensateFn, // (snapshot: TSnapshot) => Promise<unknown>  — compensating action
//   });
//
// State machine (per-call):
//   idle → (mutate) → pending → (resolve) → settled
//                             → (reject)  → error
//   Any state → (undoLast):
//     if pending  → mark aborted-by-user and fire onAbort(input) at once.
//                   The forward request is never aborted: an abort cannot
//                   un-send it (#857). When it later resolves, run compensateFn.
//                   When it fails, there is nothing to compensate.
//     if settled  → call compensateFn(snapshot)
//     if error    → no-op
//     → idle
//
// Unmount does nothing to the in-flight request. It settles on its own, so a
// later undo from a root toast (which outlives the panel) sees `settled` and
// compensates.
//
// REV-2 #1: each mutate() call captures its own state in a closure (Call
// object). If .then() runs after the user undid or a follow-up mutate
// preempted the call, compensateFn reconciles the server commit instead of
// dropping the response. The request itself is not aborted.
//
// REV-2 NEW-1 / NEW-2: when mutate() preempts a pending prior call, fire
// onAbort(prevInput) so the caller can restore that optimistic row. If the
// prior call later resolves, run compensateFn so that server commit is reverted.

import { useCallback, useRef, useState } from 'react';

export type MutationState = 'idle' | 'pending' | 'settled' | 'error';

export interface UseUndoableMutationOptions<TInput, TOutput, TSnapshot = TInput> {
  mutationFn: (input: TInput) => Promise<TOutput>;
  snapshot: (input: TInput) => TSnapshot;
  /**
   * Compensating action. Receives the snapshot captured at mutate() time AND
   * the resolved mutation output (or null if compensate fires before the
   * mutation resolved). The output lets the caller use server-fresh fields
   * (e.g. updated_at / ETag) instead of the stale baseline at mutate() time
   * (REV-1 #4).
   */
  compensateFn: (snapshot: TSnapshot, output: TOutput | null) => Promise<unknown>;
  /**
   * Optional error handler. Receives the error AND the original input that
   * was being mutated, so the caller can close over the failing row even if
   * upstream state (e.g. `selectedId`) has already advanced (REV-1 #5).
   */
  onError?: (err: unknown, input: TInput) => void;
  /**
   * Optional handler — fired when undoLast() runs while a call is in flight,
   * OR when a follow-up mutate() preempts a pending prior call (REV-2 NEW-1).
   * Receives the original input that was being mutated, so the caller can
   * revert optimistic UI side-effects (e.g. restore a removed row) at once.
   * The forward request keeps running; compensation happens only if it succeeds.
   */
  onAbort?: (input: TInput) => void;
  /**
   * Optional compensation-error handler — fired when compensateFn rejects
   * (either because a required refetch failed, or the compensating PATCH itself
   * returned an error). REV-4: prevents unhandled rejections from fire-and-forget
   * `void compensate()` in undoLast; callers use this to surface an error toast.
   */
  onCompensateError?: (err: unknown) => void;
}

/**
 * Opaque token returned by `mutate()` identifying that specific call. Pass it
 * back to `undoLast(token)` to bind an undo trigger (e.g. a toast button) to
 * the originating call only. If the current call's token doesn't match, the
 * undo is a no-op — preventing stale toasts from affecting a follow-up
 * mutation (REV-3 Cluster X).
 */
export type CallToken = number & { readonly __brand: 'CallToken' };

export interface UseUndoableMutationResult<TInput> {
  mutate: (input: TInput) => CallToken;
  /**
   * Undo the latest call.
   *
   * - When `callToken` is omitted: legacy behavior — operates on the current
   *   call regardless of identity (kept for tests / call sites that don't
   *   manage tokens).
   * - When `callToken` is provided: only fires if it matches the current
   *   call's token; otherwise no-op (token-bound undo).
   */
  undoLast: (callToken?: CallToken) => void;
  compensate: () => Promise<void>;
  state: MutationState;
}

// Per-call state. Each mutate() invocation creates a fresh Call closed over by
// the corresponding .then/.catch handlers. This isolates concurrent or
// preempted calls so their compensation paths don't trample each other.
interface Call<TInput, TOutput, TSnapshot> {
  token: CallToken;
  input: TInput;
  snapshot: TSnapshot;
  output: TOutput | null;
  // 'pending' → request in flight.
  // 'aborted-by-user' → undoLast() ran while pending. The request is not
  //   aborted (#857); a later resolve compensates, a rejection does not.
  // 'preempted' → mutate() preempted this call with a new one (REV-2 NEW-1).
  // 'settled' → server returned success and the response was processed.
  // 'error' → server rejected.
  status: 'pending' | 'aborted-by-user' | 'preempted' | 'settled' | 'error';
}

export function useUndoableMutation<TInput, TOutput, TSnapshot = TInput>(
  opts: UseUndoableMutationOptions<TInput, TOutput, TSnapshot>,
): UseUndoableMutationResult<TInput> {
  const [state, setState] = useState<MutationState>('idle');

  // Refs so callbacks always see the latest values without stale closures.
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // The current Call — pointed at by undoLast()/compensate(). Older Calls
  // remain referenced by their own .then/.catch closures even after a
  // preemption.
  const currentCallRef = useRef<Call<TInput, TOutput, TSnapshot> | null>(null);
  // Synchronous phase ref mirroring the React state. undoLast branches on
  // THIS ref, never on the React `state` closure — if the request settled
  // between the user click and undoLast running, the closure's `state` would
  // still be 'pending' and we would skip compensation even though the server
  // committed (REV-1 #2).
  const phaseRef = useRef<MutationState>('idle');

  // Monotonic token generator. Each mutate() invocation gets a fresh token so
  // toasts (and any other UI tied to a specific call) can bind their undo
  // action to one call and become inert once a newer call has started
  // (REV-3 Cluster X).
  const nextTokenRef = useRef(0);

  const mutate = useCallback((input: TInput): CallToken => {
    // REV-2 NEW-1: if a prior call is still pending, mark it preempted and
    // restore its optimistic UI. Do not abort the request (#857). Its .then()
    // may still resolve later — when it does, that closure runs compensateFn
    // against the prior snapshot (REV-2 NEW-2).
    const prior = currentCallRef.current;
    if (prior && prior.status === 'pending') {
      prior.status = 'preempted';
      optsRef.current.onAbort?.(prior.input);
    }

    nextTokenRef.current += 1;
    const token = nextTokenRef.current as CallToken;
    const call: Call<TInput, TOutput, TSnapshot> = {
      token,
      input,
      snapshot: optsRef.current.snapshot(input),
      output: null,
      status: 'pending',
    };
    currentCallRef.current = call;

    phaseRef.current = 'pending';
    setState('pending');

    optsRef.current
      .mutationFn(input)
      .then((output) => {
        call.output = output;
        // Undo or preemption already restored the local row. The server still
        // committed — run compensateFn. Do not drop the response.
        if (call.status === 'aborted-by-user' || call.status === 'preempted') {
          call.status = 'settled';
          // REV-4: attach .catch so compensation failures do not become
          // unhandled rejections. Surface via onCompensateError.
          void optsRef.current.compensateFn(call.snapshot, output).catch((err: unknown) => {
            optsRef.current.onCompensateError?.(err);
          });
          // Don't touch phaseRef/state — undoLast or the new mutate already
          // moved the hook out of pending for THIS call's lifecycle.
          return;
        }
        // Normal happy path.
        call.status = 'settled';
        // Only flip the hook state if this is still the current call.
        if (currentCallRef.current === call) {
          phaseRef.current = 'settled';
          setState('settled');
        }
      })
      .catch((err: unknown) => {
        if (call.status === 'aborted-by-user' || call.status === 'preempted') {
          // Local row already restored by onAbort. The forward request failed,
          // so there is nothing to compensate.
          return;
        }
        console.error('[useUndoableMutation] mutation failed', err);
        call.status = 'error';
        if (currentCallRef.current === call) {
          phaseRef.current = 'error';
          setState('error');
        }
        optsRef.current.onError?.(err, input);
      });

    return token;
  }, []);

  const compensate = useCallback(async () => {
    const call = currentCallRef.current;
    if (!call || call.status !== 'settled') return;
    const snap = call.snapshot;
    const out = call.output;
    // Clear so a double-click on undo cannot double-compensate.
    currentCallRef.current = null;
    await optsRef.current.compensateFn(snap, out);
  }, []);

  // REV-1 #2: branch on phaseRef (sync, mirrors the actual call lifecycle),
  // NEVER on the React `state` closure. If the request settled between the
  // click and undoLast running, phaseRef.current === 'settled' here even
  // though `state` is still 'pending' in this closure.
  const undoLast = useCallback(
    (callToken?: CallToken) => {
      const phase = phaseRef.current;
      const call = currentCallRef.current;
      if (!call) return;
      // REV-3 Cluster X: when a token is supplied, only undo if it matches the
      // current call. Stale toasts (issued before a follow-up mutate replaced
      // the current call) are inert.
      if (callToken !== undefined && call.token !== callToken) return;

      if (phase === 'pending') {
        // Mark the call so its .then() compensates if the server commits, and
        // restore the optimistic UI now. Do not abort the request (#857): the
        // closure on the pending promise still needs to inspect call.status.
        const abortedInput = call.input;
        call.status = 'aborted-by-user';
        phaseRef.current = 'idle';
        setState('idle');
        optsRef.current.onAbort?.(abortedInput);
        // Detach from currentCallRef so a follow-up mutate doesn't see this
        // call as still pending.
        currentCallRef.current = null;
        return;
      }

      if (phase === 'settled') {
        // Already resolved: fire compensate, then reset.
        // REV-4: attach .catch so compensation failures (refetch error, 409, etc.)
        // do not become unhandled rejections. Surface via onCompensateError.
        void compensate()
          .then(() => {
            phaseRef.current = 'idle';
            setState('idle');
          })
          .catch((err: unknown) => {
            phaseRef.current = 'idle';
            setState('idle');
            optsRef.current.onCompensateError?.(err);
          });
        return;
      }

      // error or idle: no-op
    },
    [compensate],
  );

  return { mutate, undoLast, compensate, state };
}
