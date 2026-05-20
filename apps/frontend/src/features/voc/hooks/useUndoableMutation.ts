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
  compensateFn: (snapshot: TSnapshot) => Promise<unknown>;
  /** Optional error handler — called with the error when mutationFn rejects (non-abort). */
  onError?: (err: unknown) => void;
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

    // Capture snapshot for potential compensate.
    snapshotRef.current = optsRef.current.snapshot(input);

    setState('pending');

    optsRef.current
      .mutationFn(input, controller.signal)
      .then(() => {
        if (controller.signal.aborted) return;
        isSettledRef.current = true;
        setState('settled');
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) {
          // Aborted in-flight — state already set to idle in undoLast(); no-op here.
          return;
        }
        console.error('[useUndoableMutation] mutation failed', err);
        setState('error');
        optsRef.current.onError?.(err);
      });
  }, []);

  const compensate = useCallback(async () => {
    if (!isSettledRef.current || snapshotRef.current === null) return;
    const snap = snapshotRef.current;
    snapshotRef.current = null;
    isSettledRef.current = false;
    await optsRef.current.compensateFn(snap);
  }, []);

  const undoLast = useCallback(() => {
    if (state === 'pending') {
      // In-flight: abort the controller immediately and reset state now.
      // We set state to idle synchronously here so callers see the change
      // without waiting for the async abort rejection to propagate.
      controllerRef.current?.abort();
      snapshotRef.current = null;
      isSettledRef.current = false;
      setState('idle');
      return;
    }

    if (state === 'settled') {
      // Already resolved: fire compensate, then reset.
      void compensate().then(() => setState('idle'));
      return;
    }

    // error or idle: no-op
  }, [state, compensate]);

  return { mutate, undoLast, compensate, state };
}
