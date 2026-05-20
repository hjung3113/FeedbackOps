// useUndoableMutation.test.ts — RED tests for the generic undo mutation hook.
// TDD RED: written before the implementation file exists.
// Covers: abort in-flight, settled compensate, error rollback, snapshot, dispose.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUndoableMutation } from '../useUndoableMutation';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * makeSuccessHook — creates mock fns for a mutation that resolves after `delay` ms.
 * delay=0 uses Promise.resolve() (microtask) so fake timers are not needed.
 * delay>0 uses setTimeout so the caller must advance fake timers.
 */
function makeSuccessHook(delay = 0) {
  const mutationFn = vi.fn(
    (_input: string, signal?: AbortSignal) => {
      if (delay === 0) {
        // Resolve immediately as a microtask — no setTimeout needed.
        return new Promise<string>((resolve, reject) => {
          Promise.resolve().then(() => {
            if (signal?.aborted) {
              reject(new DOMException('Aborted', 'AbortError'));
            } else {
              resolve('ok');
            }
          });
        });
      }
      return new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => resolve('ok'), delay);
        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    },
  );
  const snapshot = vi.fn((input: string) => `snap:${input}`);
  const compensateFn = vi.fn((_snap: string) => Promise.resolve('compensated'));
  return { mutationFn, snapshot, compensateFn };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useUndoableMutation', () => {
  it('abort cancels an in-flight mutation before it resolves', () => {
    vi.useFakeTimers();
    try {
      const { mutationFn, snapshot, compensateFn } = makeSuccessHook(500);

      const { result } = renderHook(() =>
        useUndoableMutation<string, string>({ mutationFn, snapshot, compensateFn }),
      );

      // fire and abort before it resolves
      act(() => { result.current.mutate('hello'); });
      act(() => { result.current.undoLast(); });

      // compensateFn should NOT be called on in-flight abort
      expect(compensateFn).not.toHaveBeenCalled();
      expect(result.current.state).toBe('idle');
    } finally {
      vi.useRealTimers();
    }
  });

  it('settled compensate fires with a fresh key after mutation resolves', async () => {
    const { mutationFn, snapshot, compensateFn } = makeSuccessHook(0);

    const { result } = renderHook(() =>
      useUndoableMutation<string, string>({ mutationFn, snapshot, compensateFn }),
    );

    await act(async () => { result.current.mutate('world'); });

    // Now the mutation is settled — undoLast triggers compensateFn
    await act(async () => { result.current.undoLast(); });

    expect(compensateFn).toHaveBeenCalledOnce();
    // REV-1 #4: compensateFn now receives (snapshot, output) — output is 'ok'
    // from mutationFn's resolved value (TriagePanel uses it as fresh updated_at).
    expect(compensateFn).toHaveBeenCalledWith('snap:world', 'ok');
  });

  it('error during mutation sets state to error and does not call compensateFn on undo', async () => {
    const mutationFn = vi.fn(() => Promise.reject(new Error('network error')));
    const snapshot = vi.fn((input: string) => `snap:${input}`);
    const compensateFn = vi.fn(() => Promise.resolve('compensated'));

    const { result } = renderHook(() =>
      useUndoableMutation<string, string>({ mutationFn, snapshot, compensateFn }),
    );

    await act(async () => { result.current.mutate('fail'); });

    expect(result.current.state).toBe('error');

    // undo after error should not fire compensate (nothing to undo)
    act(() => { result.current.undoLast(); });
    expect(compensateFn).not.toHaveBeenCalled();
  });

  it('snapshot value is preserved from the original mutate call', async () => {
    const { mutationFn, snapshot, compensateFn } = makeSuccessHook(0);

    const { result } = renderHook(() =>
      useUndoableMutation<string, string>({ mutationFn, snapshot, compensateFn }),
    );

    await act(async () => { result.current.mutate('capture-me'); });
    await act(async () => { result.current.undoLast(); });

    expect(snapshot).toHaveBeenCalledWith('capture-me');
    // REV-1 #4: compensateFn receives (snapshot, output).
    expect(compensateFn).toHaveBeenCalledWith('snap:capture-me', 'ok');
  });

  it('dispose/cleanup aborts any pending in-flight mutation', () => {
    vi.useFakeTimers();
    try {
      const { mutationFn, snapshot, compensateFn } = makeSuccessHook(1000);

      const { result, unmount } = renderHook(() =>
        useUndoableMutation<string, string>({ mutationFn, snapshot, compensateFn }),
      );

      act(() => { result.current.mutate('cleanup-test'); });
      expect(result.current.state).toBe('pending');

      // unmount triggers useEffect cleanup → aborts the controller
      unmount();

      // compensateFn should never have fired
      expect(compensateFn).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
