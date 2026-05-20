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

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
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
