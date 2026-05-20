// useUndoableMutation.ts — Generic undo-able mutation hook.
//
// Signature:
//   const { mutate, compensate, undoLast, state } = useUndoableMutation<TInput, TOutput>({
//     mutationFn,   // (input: TInput, signal?: AbortSignal) => Promise<TOutput>
//     snapshot,     // (input: TInput) => TSnapshot  — captures rollback data
//     compensateFn, // (snapshot: TSnapshot) => Promise<unknown>  — compensating action
//   });
//
// State machine (per-call):
//   idle → (mutate) → pending → (resolve) → settled
//                             → (reject)  → error
//   Any state → (undoLast):
//     if pending  → abort in-flight, fire onAbort(input); if .then later resolves
//                   (server committed before abort fired), run compensateFn to reconcile.
//     if settled  → call compensateFn(snapshot)
//     if error    → no-op
//     → idle
//
// REV-2 #1 (abort-after-settle): the prior implementation dropped the response
// when signal.aborted was true at the top of .then(). This left the server
// committed while the local row had been restored by onAbort → divergence.
// Fix: each mutate() call captures its own state in a closure (Call object).
// If the call's .then() runs and the call was aborted by the user (undoLast
// or preempted by a follow-up mutate), the hook runs compensateFn against
// the original snapshot+output instead of silently dropping the response.
//
// REV-2 NEW-1 / NEW-2 (second mutate aborts first silently): mutate() used to
// abort any prior in-flight call without invoking onAbort. The caller's
// optimistic UI row stayed removed. Fix: when mutate() preempts a pending
// prior call, fire onAbort(prevInput); when the preempted call's .then
// later resolves, run compensateFn so the prior server commit is reverted.

import { useCallback, useEffect, useRef, useState } from 'react';

export type MutationState = 'idle' | 'pending' | 'settled' | 'error';

export interface UseUndoableMutationOptions<TInput, TOutput, TSnapshot = TInput> {
  mutationFn: (input: TInput, signal?: AbortSignal) => Promise<TOutput>;
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
   * Optional abort handler — fired when undoLast() aborts an in-flight call,
   * OR when a follow-up mutate() preempts a pending prior call (REV-2 NEW-1).
   * Receives the original input that was being mutated, so the caller can
   * compensate optimistic UI side-effects (e.g. restore a removed row).
   */
  onAbort?: (input: TInput) => void;
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
  controller: AbortController;
  // 'pending' → request in flight.
  // 'aborted-by-user' → undoLast() aborted while pending (REV-2 #1).
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

  // Cleanup: abort any in-flight request on unmount.
  useEffect(() => {
    return () => {
      currentCallRef.current?.controller.abort();
    };
  }, []);

  const mutate = useCallback((input: TInput): CallToken => {
    // REV-2 NEW-1: if a prior call is still pending, treat the preemption as
    // an abort for the prior call so the caller can restore its optimistic
    // UI. The prior call's .then() may still resolve later — when it does,
    // its closure runs compensateFn against the prior snapshot to reconcile
    // any server-side commit (REV-2 NEW-2).
    const prior = currentCallRef.current;
    if (prior && prior.status === 'pending') {
      prior.status = 'preempted';
      prior.controller.abort();
      optsRef.current.onAbort?.(prior.input);
    }

    const controller = new AbortController();
    nextTokenRef.current += 1;
    const token = nextTokenRef.current as CallToken;
    const call: Call<TInput, TOutput, TSnapshot> = {
      token,
      input,
      snapshot: optsRef.current.snapshot(input),
      output: null,
      controller,
      status: 'pending',
    };
    currentCallRef.current = call;

    phaseRef.current = 'pending';
    setState('pending');

    optsRef.current
      .mutationFn(input, controller.signal)
      .then((output) => {
        call.output = output;
        // REV-2 #1 / NEW-2: if the call was already aborted (by undoLast or by
        // a follow-up mutate preemption), the server still committed — run
        // compensateFn to reconcile, do NOT silently drop the response.
        if (call.status === 'aborted-by-user' || call.status === 'preempted') {
          call.status = 'settled';
          void optsRef.current.compensateFn(call.snapshot, output);
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
          // The error is the abort error itself or a network error after abort.
          // Local row already restored by onAbort; server never committed
          // (no successful response). Nothing more to do.
          return;
        }
        // Component unmount cleanup aborts the controller without flipping
        // call.status; swallow that path silently.
        if (call.controller.signal.aborted) return;
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
  const undoLast = useCallback((callToken?: CallToken) => {
    const phase = phaseRef.current;
    const call = currentCallRef.current;
    if (!call) return;
    // REV-3 Cluster X: when a token is supplied, only undo if it matches the
    // current call. Stale toasts (issued before a follow-up mutate replaced
    // the current call) are inert.
    if (callToken !== undefined && call.token !== callToken) return;

    if (phase === 'pending') {
      // REV-2 #1: mark the call as user-aborted so its .then() handler (if it
      // resolves later because the server already committed) runs compensateFn
      // to reconcile. Do NOT clear the call ref here; the closure on the
      // pending promise still needs to inspect call.status.
      const abortedInput = call.input;
      call.status = 'aborted-by-user';
      call.controller.abort();
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
      void compensate().then(() => {
        phaseRef.current = 'idle';
        setState('idle');
      });
      return;
    }

    // error or idle: no-op
  }, [compensate]);

  return { mutate, undoLast, compensate, state };
}
