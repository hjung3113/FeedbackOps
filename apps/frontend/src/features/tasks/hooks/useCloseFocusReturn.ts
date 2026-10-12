import * as React from 'react';

/** Retry ceiling for the fullscreen case: ~10 frames, then give up. */
const MAX_FRAMES = 10;

interface PendingReturn {
  id: string;
  frame: number | null;
  frames: number;
}

/**
 * #1032: returns keyboard focus to the selected row after the detail panel closes.
 *
 * One instance per screen. `rowRef(id)` hands each list row a stable ref callback
 * that registers the element on attach and removes it on detach — Task Request rows
 * remount when the list container key (`[context, phase]`) changes, so a stale
 * element must never survive in the registry. `returnFocus(id)` runs synchronously
 * inside the close handler, before the selection state changes: the row is still
 * mounted then (closing changes neither tab nor list), so focus moves from the
 * close button straight to the row and never passes through `body`.
 *
 * While the panel is fullscreen the row sits inside AppFrame's `<main hidden>`;
 * `returnFocus` then retries on `requestAnimationFrame`, resolving the row again
 * every frame, until it is connected and visible (focus it, stop), gone (stop),
 * or MAX_FRAMES pass (stop). `cancel()` drops a pending return; every later
 * selection, a change of `context` (the screen's tab/view and scope), and unmount
 * cancel. Only the close path
 * starts a return — row selection, link-missing cleanup, and decision completion
 * never move focus.
 */
export function useCloseFocusReturn(context: string) {
  const rowsRef = React.useRef(new Map<string, HTMLElement>());
  const refCallbacksRef = React.useRef(new Map<string, (element: HTMLElement | null) => void>());
  const pendingRef = React.useRef<PendingReturn | null>(null);

  const cancel = React.useCallback(() => {
    const pending = pendingRef.current;
    if (pending === null) return;
    pendingRef.current = null;
    if (pending.frame !== null) window.cancelAnimationFrame(pending.frame);
  }, []);

  // A context change (tab/view or scope) cancels; so does unmount, so a pending
  // return never fires after the screen is gone.
  const contextRef = React.useRef(context);
  React.useEffect(() => {
    if (contextRef.current !== context) {
      contextRef.current = context;
      cancel();
    }
  }, [context, cancel]);
  React.useEffect(() => cancel, [cancel]);

  const rowRef = React.useCallback((id: string) => {
    const cached = refCallbacksRef.current.get(id);
    if (cached !== undefined) return cached;
    // No ref writes during render: the candidate below is not stored here. It
    // caches itself on its first non-null attach (commit time), and the cache
    // keeps it across detaches — detach removes only the live element — so the
    // per-id callback identity stays stable once attached.
    const attach = (element: HTMLElement | null) => {
      if (element === null) {
        rowsRef.current.delete(id);
        return;
      }
      if (refCallbacksRef.current.get(id) === undefined) {
        refCallbacksRef.current.set(id, attach);
      }
      rowsRef.current.set(id, element);
    };
    return attach;
  }, []);

  const focusSelectedRow = (id: string): 'focused' | 'hidden' | 'gone' => {
    const element = rowsRef.current.get(id);
    if (element === undefined || !element.isConnected) return 'gone';
    for (let node: HTMLElement | null = element; node !== null; node = node.parentElement) {
      if (node.hidden) return 'hidden';
    }
    element.focus();
    return 'focused';
  };

  const tick = (id: string) => {
    const pending = pendingRef.current;
    if (pending === null || pending.id !== id) return; // cancelled since scheduling
    if (focusSelectedRow(id) !== 'hidden') {
      pendingRef.current = null;
      return;
    }
    if (pending.frames + 1 >= MAX_FRAMES) {
      pendingRef.current = null;
      return;
    }
    pendingRef.current = {
      id,
      frame: window.requestAnimationFrame(() => tick(id)),
      frames: pending.frames + 1,
    };
  };

  const returnFocus = (id: string) => {
    cancel();
    if (focusSelectedRow(id) !== 'hidden') return;
    pendingRef.current = {
      id,
      frame: window.requestAnimationFrame(() => tick(id)),
      frames: 0,
    };
  };

  return { rowRef, returnFocus, cancel };
}
