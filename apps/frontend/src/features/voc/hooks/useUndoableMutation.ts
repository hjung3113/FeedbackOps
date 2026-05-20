// useUndoableMutation.ts — Generic undo-able mutation hook.
//
// Signature:
//   const { mutate, compensate, undoLast, state } = useUndoableMutation<TInput, TOutput>({
//     mutationFn,   // (input: TInput, signal?: AbortSignal) => Promise<TOutput>
//     snapshot,     // (input: TInput) => TSnapshot  — captures rollback data
//     compensateFn, // (snapshot: TSnapshot) => Promise<unknown>  — compensating action
//   });
//
// State machine:
//   idle → (mutate) → pending → (resolve) → settled
//                             → (reject)  → error
//   Any state → (undoLast):
//     if pending  → abort in-flight, no compensate
//     if settled  → call compensateFn(snapshot)
//     if error    → no-op
//     → idle
//
// Each mutate() call mints a fresh AbortController. The controller is aborted
// on undoLast() (in-flight) or on component unmount (cleanup).

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
   * Optional abort handler — fired when undoLast() aborts an in-flight call.
   * Receives the original input that was being mutated, so the caller can
   * compensate optimistic UI side-effects (e.g. restore a removed row).
   * REV-1 #1.
   */
  onAbort?: (input: TInput) => void;
}

export interface UseUndoableMutationResult<TInput> {
  mutate: (input: TInput) => void;
  undoLast: () => void;
  compensate: () => Promise<void>;
  state: MutationState;
}

export function useUndoableMutation<TInput, TOutput, TSnapshot = TInput>(
  opts: UseUndoableMutationOptions<TInput, TOutput, TSnapshot>,
): UseUndoableMutationResult<TInput> {
  const [state, setState] = useState<MutationState>('idle');

  // Refs so callbacks always see the latest values without stale closures.
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // Per-call AbortController — aborted on undo (in-flight) or unmount.
  const controllerRef = useRef<AbortController | null>(null);
  // Snapshot captured at mutate() time — used by compensateFn on settled undo.
  const snapshotRef = useRef<TSnapshot | null>(null);
  // Tracks whether the latest mutation settled successfully.
  const isSettledRef = useRef(false);
  // Tracks the input of the latest mutate() call, so onError / onAbort
  // closures always see the exact input that was in-flight, not whatever the
  // parent component has re-rendered to (REV-1 #1, #5).
  const inputRef = useRef<TInput | null>(null);
  // Resolved mutation output — passed to compensateFn so the caller can use
  // server-fresh fields like updated_at / ETag instead of the stale baseline
  // (REV-1 #4).
  const outputRef = useRef<TOutput | null>(null);
  // Synchronous phase ref mirroring the React state. undoLast branches on
  // THIS ref, never on the React `state` closure — if the request settled
  // between the user click and undoLast running, the closure's `state` would
  // still be 'pending' and we would skip compensation even though the server
  // committed (REV-1 #2).
  const phaseRef = useRef<MutationState>('idle');

  // Cleanup: abort any in-flight request on unmount.
  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  const mutate = useCallback((input: TInput) => {
    // Abort any prior in-flight call before starting a new one.
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    isSettledRef.current = false;
    inputRef.current = input;
    outputRef.current = null;

    // Capture snapshot for potential compensate.
    snapshotRef.current = optsRef.current.snapshot(input);

    phaseRef.current = 'pending';
    setState('pending');

    optsRef.current
      .mutationFn(input, controller.signal)
      .then((output) => {
        if (controller.signal.aborted) return;
        outputRef.current = output;
        isSettledRef.current = true;
        phaseRef.current = 'settled';
        setState('settled');
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) {
          // Aborted in-flight — state already set to idle in undoLast(); no-op here.
          return;
        }
        console.error('[useUndoableMutation] mutation failed', err);
        phaseRef.current = 'error';
        setState('error');
        optsRef.current.onError?.(err, input);
      });
  }, []);

  const compensate = useCallback(async () => {
    if (!isSettledRef.current || snapshotRef.current === null) return;
    const snap = snapshotRef.current;
    const out = outputRef.current;
    snapshotRef.current = null;
    outputRef.current = null;
    isSettledRef.current = false;
    await optsRef.current.compensateFn(snap, out);
  }, []);

  // REV-1 #2: branch on phaseRef (sync, mirrors the actual call lifecycle),
  // NEVER on the React `state` closure. If the request settled between the
  // click and undoLast running, phaseRef.current === 'settled' here even
  // though `state` is still 'pending' in this closure.
  const undoLast = useCallback(() => {
    const phase = phaseRef.current;

    if (phase === 'pending') {
      // REV-1 #1: snapshot the original input BEFORE clearing it, so onAbort
      // can target the correct row regardless of upstream re-renders.
      const abortedInput = inputRef.current;
      controllerRef.current?.abort();
      snapshotRef.current = null;
      isSettledRef.current = false;
      inputRef.current = null;
      phaseRef.current = 'idle';
      setState('idle');
      if (abortedInput !== null) optsRef.current.onAbort?.(abortedInput);
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
