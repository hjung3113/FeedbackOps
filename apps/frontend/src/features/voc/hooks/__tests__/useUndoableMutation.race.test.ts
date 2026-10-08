// useUndoableMutation.race.test.ts — codex REV-1 P1-#2
//
// Finding: undoLast() branches on the React `state` closure. If the request
// settles between the click and the abort, the closure can still see
// 'pending', skip compensation, abort a finished fetch, and silently leave
// the server-committed state in place.
//
// Fix: branch on a synchronous ref tied to the actual call lifecycle so that
// a settle that landed before undoLast() runs is honoured and compensateFn
// fires.

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useUndoableMutation } from '../useUndoableMutation';

describe('useUndoableMutation — settle-vs-undo race (REV-1 #2)', () => {
  it('compensateFn fires when undoLast() runs in the same tick as settle (no stale closure)', async () => {
    // mutationFn resolves immediately as a microtask; we then fire undoLast()
    // *without* awaiting a re-render in between, so the closure-captured
    // `state` is still 'pending' but the request has already resolved.

    const mutationFn = vi.fn(async (_input: string) => 'ok');
    const snapshot = vi.fn((input: string) => `snap:${input}`);
    const compensateFn = vi.fn(async (_snap: string) => 'compensated');

    const { result } = renderHook(() =>
      useUndoableMutation<string, string>({ mutationFn, snapshot, compensateFn }),
    );

    // Fire mutate AND undoLast inside the same act() block. The microtask
    // resolves the mutationFn (so isSettledRef flips to true) before
    // undoLast() runs at the end of the block — but the closure inside
    // undoLast still has state='pending'. The correct behaviour is to
    // compensate, not silently abort.
    await act(async () => {
      result.current.mutate('race-me');
      // Yield once so the mutationFn microtask resolves and the phase ref
      // flips to 'settled' synchronously inside the .then() callback.
      await Promise.resolve();
      await Promise.resolve();
      result.current.undoLast();
    });

    // Compensate must fire — the server may have committed the write.
    expect(compensateFn).toHaveBeenCalledOnce();
    // REV-1 #4: compensateFn receives (snapshot, output).
    expect(compensateFn).toHaveBeenCalledWith('snap:race-me', 'ok');
  });
});

// Former useUndoableMutation.abortRace.test.ts — codex REV-2 P1 #1 + NEW-1, NEW-2
//
// Two race conditions in the abort/settle lifecycle:
//
// (A) Undo before the response handler: the server response is already
//     queued, but undoLast() runs BEFORE `.then()`. The forward request is
//     not aborted (#857). Required behavior: onAbort restores the local row
//     immediately, and when the response is handled, run compensateFn.
//
// (B) Second mutate() while the first is pending: the prior optimistic row
//     must be restored, and (if the server commits) the prior server row must
//     be reverted. The prior request is not aborted. Required behavior: fire
//     onAbort(prevInput), AND if the prior call later resolves, run
//     compensateFn against the prior snapshot/output.

describe('useUndoableMutation — undo before the response handler (REV-2 #1)', () => {
  it('runs compensateFn when undoLast() runs but the response was already received', async () => {
    // Resolver we control: lets us settle the server response BEFORE the
    // .then() microtask gets to flush. We grab the resolver and call it
    // before yielding the microtask queue, then synchronously call undoLast().
    // undoLast() does not abort the request. The .then() handler then runs
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
      // microtask queue flushes inside this act. Then synchronously undo.
      resolveFn?.('server-output');
      result.current.undoLast();
      // Flush microtasks so .then runs and compensates the committed response.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // onAbort fires immediately on undoLast() — local row restored.
    expect(onAbort).toHaveBeenCalledWith('race-settle');
    // compensateFn must fire when the .then() handler sees the server
    // committed after undo — server reverted.
    expect(compensateFn).toHaveBeenCalledOnce();
    expect(compensateFn).toHaveBeenCalledWith('snap:race-settle', 'server-output');
  });
});

describe('useUndoableMutation — second mutate preempts first (REV-2 NEW-1)', () => {
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
      // Preempt: second mutate marks the first pending call. The request is
      // not aborted.
      result.current.mutate('second');
      // Now resolve the first call AFTER it was preempted. The hook should
      // run compensateFn against the first snapshot to reconcile the server.
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
