// UndoToast.tsx — Undo action toast primitive for @fops/ui.
//
// Prototype ref: docs/design-prototype/screen-voc-create.jsx:699-730
// Translated to Pack 17 / ADR-0021 tokens (no raw hex, no raw px outside spacing scale).
//
// Usage: render via sonner's toast.custom() so position is inherited from <Toaster>.
// UndoToast owns the only auto-dismiss timer (#960): it pauses while keyboard
// focus is inside the toast or the pointer is over it, and resumes with the
// remaining time when both leave. Disable sonner's own timer with Infinity so
// it never dismisses the toast behind UndoToast's back.
// Escape pressed while keyboard focus is inside the toast dismisses it (#1025).
//   toast.custom((id) => (
//     <UndoToast
//       message="Triage 확정됨"
//       onAction={() => { undoLast(); toast.dismiss(id); }}
//       onDismiss={() => toast.dismiss(id)}
//       duration={4000}
//     />
//   ), { duration: Infinity });

import * as React from 'react';
import { CircleCheck } from 'lucide-react';
import { Button } from '../components/Button.js';
import { cn } from '../utils/cn.js';

export interface UndoToastProps {
  /** Main copy shown inside the toast (e.g. "Triage 확정됨"). */
  message: string;
  /** Called when the user clicks 실행 취소 or presses Enter on the button. */
  onAction: () => void;
  /** Called when the auto-dismiss timer fires or Escape is pressed inside the toast. Optional. */
  onDismiss?: () => void;
  /** Auto-dismiss delay in ms. 0 disables the timer. Default: 4000. Paused while focus/pointer is inside. */
  duration?: number;
  className?: string;
}

export function UndoToast({
  message,
  onAction,
  onDismiss,
  duration = 4000,
  className,
}: UndoToastProps) {
  // #960 pause sources: keyboard focus inside the sonner toast, pointer over
  // the card.
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [focusWithin, setFocusWithin] = React.useState(false);
  const [pointerWithin, setPointerWithin] = React.useState(false);
  const paused = focusWithin || pointerWithin;

  // The timer always restarts with what is left — after a pause and when an
  // unrelated re-render re-arms this effect. Bookkeeping lives in the effect,
  // never in render.
  const remainingRef = React.useRef(duration);
  const startedAtRef = React.useRef<number | null>(null);
  // One-shot expiry: set when the budget is spent, reset only by a duration
  // change, so a new onDismiss identity or pause/resume cycling cannot call
  // onDismiss again.
  const expiredRef = React.useRef(false);
  // #1025: the pause-host effect below registers its listeners once ([] deps),
  // so its Escape handler reads onDismiss through this ref instead of the
  // effect depending on the prop identity.
  const onDismissRef = React.useRef(onDismiss);
  React.useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  // A duration change is a new budget: reset the remaining time and the
  // expiry flag. Declared before the timer effect so its cleanup (which
  // books the time spent under the old budget) runs first.
  React.useEffect(() => {
    remainingRef.current = duration;
    expiredRef.current = false;
  }, [duration]);

  // Pause host (#960): sonner wraps toast.custom() content in
  // <li data-sonner-toast tabindex=0>, which the first Tab can land on, so
  // focus anywhere inside that element pauses — not only focus inside the
  // card. focusin/focusout cover real browsers; capture-phase focus/blur
  // also cover the non-bubbling events fireEvent.focus/blur dispatch (as in
  // this file's tests).
  React.useEffect(() => {
    const host = rootRef.current?.closest('[data-sonner-toast]') ?? rootRef.current;
    if (!host) return;
    if (host.contains(document.activeElement as Node | null)) setFocusWithin(true);
    const pause = () => setFocusWithin(true);
    const resume = (e: Event) => {
      // Keep pausing when focus moves between children (relatedTarget stays
      // inside the host); only leave-pause when it moves outside or away.
      const related = (e as FocusEvent).relatedTarget as Node | null;
      if (!host.contains(related)) setFocusWithin(false);
    };
    host.addEventListener('focusin', pause);
    host.addEventListener('focus', pause, true);
    host.addEventListener('focusout', resume);
    host.addEventListener('blur', resume, true);
    // #1025: Escape with focus anywhere inside the host dismisses the toast
    // through the same one-shot flag as the timer.
    const onKeyDown = (e: Event) => {
      if ((e as KeyboardEvent).key !== 'Escape') return;
      if (expiredRef.current || !onDismissRef.current) return;
      expiredRef.current = true;
      onDismissRef.current();
    };
    host.addEventListener('keydown', onKeyDown);
    return () => {
      host.removeEventListener('focusin', pause);
      host.removeEventListener('focus', pause, true);
      host.removeEventListener('focusout', resume);
      host.removeEventListener('blur', resume, true);
      host.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  React.useEffect(() => {
    if (!duration || !onDismiss || paused || expiredRef.current) return;
    if (remainingRef.current <= 0) {
      expiredRef.current = true;
      onDismiss();
      return;
    }
    startedAtRef.current = Date.now();
    const timerId = setTimeout(() => {
      expiredRef.current = true;
      remainingRef.current = 0;
      startedAtRef.current = null;
      onDismiss();
    }, remainingRef.current);
    return () => {
      clearTimeout(timerId);
      if (startedAtRef.current !== null) {
        remainingRef.current -= Date.now() - startedAtRef.current;
        startedAtRef.current = null;
      }
    };
  }, [duration, onDismiss, paused]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter') {
      onAction();
    }
  };

  return (
    // Pack 17 translation of prototype .toast block:
    // position:fixed / bottom:24 / translateX(-50%) are handled by sonner's Toaster
    // when rendered via toast.custom(); the component itself is just the inner card.
    //
    // bg-surface-popover  → var(--surface-popover)  #edf3fb
    // border-border-subtle → var(--border-subtle)   #cbd6e6
    // rounded-lg          → border-radius: 8px
    // px-3.5 py-2.5       → padding: 10px 14px
    // shadow-xl           → var(--shadow-xl)
    // min-w-[360px]       → minWidth: 360px
    // gap-3               → gap: 12px
    <div
      ref={rootRef}
      role="status"
      aria-live="polite"
      onPointerEnter={() => setPointerWithin(true)}
      onPointerLeave={() => setPointerWithin(false)}
      className={cn(
        'flex items-center gap-3 min-w-[360px]',
        'bg-surface-popover border border-border-subtle rounded-lg px-3.5 py-2.5 shadow-xl',
        className,
      )}
    >
      {/* Check icon — color: var(--color-emerald) → text-accent-success */}
      <CircleCheck
        className="h-3.5 w-3.5 text-accent-success shrink-0"
        aria-hidden
      />

      {/* Message — text-sm flex-1 */}
      <span className="flex-1 text-sm text-text-primary">
        {message}
      </span>

      {/* 실행 취소 button — prototype: <Button variant="subtle" size="sm"> */}
      <Button
        variant="subtle"
        size="sm"
        onClick={onAction}
        onKeyDown={handleKeyDown}
      >
        실행 취소
      </Button>
    </div>
  );
}

UndoToast.displayName = 'UndoToast';
