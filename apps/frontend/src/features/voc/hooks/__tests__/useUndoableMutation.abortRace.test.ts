// useUndoableMutation.abortRace.test.ts — codex REV-2 P1 #1 + NEW-1, NEW-2
//
// Two race conditions in the abort/settle lifecycle:
//
// (A) Abort-after-settle: server commits, but undoLast() aborts BEFORE the
//     `.then()` handler ran. Old behavior: signal.aborted check at the top of
//     .then drops the successful output, no compensation fires. Local row was
//     restored by onAbort, but the server stayed triaged → divergence.
//     Required behavior: when the response is already received and aborted
//     fires, treat it as a settled commit and run compensateFn to reconcile
//     the server back to the snapshot. onAbort still restores the local row.
//
// (B) Second mutate() aborts the first pending call silently: the prior call's
//     optimistic row stays removed locally, and (if the server commits) the
//     prior server row stays triaged. Required behavior: when mutate() is
//     invoked while a prior call is still pending, fire onAbort(prevInput)
//     to restore the prior optimistic row, AND if the prior call later
//     resolves successfully, run compensateFn against the prior snapshot/output
//     so the server is reverted.

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUndoableMutation } from '../useUndoableMutation';

describe('useUndoableMutation — abort-after-settle (REV-2 #1)', () => {
  it('runs compensateFn when undoLast() aborts but the response was already received', async () => {
    // Resolver we control: lets us settle the server response BEFORE the
    // .then() microtask gets to flush. We grab the resolver and call it
    // before yielding the microtask queue, then synchronously call undoLast().
    // The undoLast() aborts the controller. The .then() handler then runs
    // and must NOT drop the output silently — it must trigger compensation
    // because the server has already committed.
    let resolveFn: ((value: string) => void) | undefined;
    const mutationFn = vi.fn((_input: string, _signal?: AbortSignal) => {
      return new Promise<string>((resolve) => {
        resolveFn = resolve;
      });
    });
    const snapshot = vi.fn((input: string) => `snap:${input}`);
    const compensateFn = vi.fn(async (_snap: string, _out: string | null) => 'compensated');
    const onAbort = vi.fn();

    const { result } = renderHook(() =>
      useUndoableMutation<string, string>({ mutationFn, snapshot, compensateFn, onAbort }),
    );

    await act(async () => {
      result.current.mutate('race-settle');
      // Resolve the server promise (fulfilled — server committed) BEFORE the
      // microtask queue flushes inside this act. Then synchronously abort.
      resolveFn?.('server-output');
      result.current.undoLast();
      // Flush microtasks so .then runs and sees signal.aborted.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // onAbort fires immediately on undoLast() — local row restored.
    expect(onAbort).toHaveBeenCalledWith('race-settle');
    // compensateFn must fire when the .then() handler discovers the server
    // committed despite the abort — server reverted.
    expect(compensateFn).toHaveBeenCalledOnce();
    expect(compensateFn).toHaveBeenCalledWith('snap:race-settle', 'server-output');
  });
});

describe('useUndoableMutation — second mutate aborts first (REV-2 NEW-1)', () => {
  it('fires onAbort for the prior pending call when mutate() is invoked again', () => {
    vi.useFakeTimers();
    try {
      const mutationFn = vi.fn(
        (_input: string, signal?: AbortSignal) =>
          new Promise<string>((resolve, reject) => {
            const timer = setTimeout(() => resolve('ok'), 500);
            signal?.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new DOMException('Aborted', 'AbortError'));
            });
          }),
      );
      const snapshot = vi.fn((input: string) => `snap:${input}`);
      const compensateFn = vi.fn(async () => 'compensated');
      const onAbort = vi.fn();

      const { result } = renderHook(() =>
        useUndoableMutation<string, string>({ mutationFn, snapshot, compensateFn, onAbort }),
      );

      act(() => {
        result.current.mutate('first');
      });
      // While first is still pending, fire a second mutate.
      act(() => {
        result.current.mutate('second');
      });

      // onAbort must have fired with the FIRST input so the caller can restore
      // the first optimistic row.
      expect(onAbort).toHaveBeenCalledWith('first');
      expect(onAbort).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('compensates the prior call when it later resolves after being preempted (REV-2 NEW-2)', async () => {
    // First call: server promise that we resolve at our chosen tick.
    let resolveFirst: ((v: string) => void) | undefined;
    // Second call: resolves quickly with a different output.
    const mutationFn = vi.fn((input: string, _signal?: AbortSignal) => {
      if (input === 'first') {
        return new Promise<string>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve('second-output');
    });
    const snapshot = vi.fn((input: string) => `snap:${input}`);
    const compensateFn = vi.fn(async () => 'compensated');
    const onAbort = vi.fn();

    const { result } = renderHook(() =>
      useUndoableMutation<string, string>({ mutationFn, snapshot, compensateFn, onAbort }),
    );

    await act(async () => {
      result.current.mutate('first');
      // Preempt: second mutate aborts the first pending call.
      result.current.mutate('second');
      // Now resolve the first call AFTER it was preempted. The hook should
      // recognise the first call's .then is firing on an aborted controller
      // but with a fulfilled value → run compensateFn against the first
      // snapshot to reconcile the server.
      resolveFirst?.('first-output');
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // onAbort fired for first.
    expect(onAbort).toHaveBeenCalledWith('first');
    // compensateFn fired with the FIRST snapshot+output (not second's).
    expect(compensateFn).toHaveBeenCalledWith('snap:first', 'first-output');
  });
});
