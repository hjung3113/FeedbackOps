// UndoToast.tsx — Undo action toast primitive for @fops/ui.
//
// Prototype ref: docs/design-prototype/screen-voc-create.jsx:699-730
// Translated to Pack 17 / ADR-0021 tokens (no raw hex, no raw px outside spacing scale).
//
// Usage: render via sonner's toast.custom() so position is inherited from <Toaster>.
//   toast.custom((id) => (
//     <UndoToast
//       message="Triage 확정됨"
//       onAction={() => { undoLast(); toast.dismiss(id); }}
//       onDismiss={() => toast.dismiss(id)}
//       duration={4000}
//     />
//   ), { duration: 4000 });

import * as React from 'react';
import { CircleCheck } from 'lucide-react';
import { Button } from '../components/Button.js';
import { cn } from '../utils/cn.js';

export interface UndoToastProps {
  /** Main copy shown inside the toast (e.g. "Triage 확정됨"). */
  message: string;
  /** Called when the user clicks 실행 취소 or presses Enter on the button. */
  onAction: () => void;
  /** Called when the auto-dismiss timer fires. Optional. */
  onDismiss?: () => void;
  /** Auto-dismiss delay in ms. 0 disables the timer. Default: 4000. */
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
  React.useEffect(() => {
    if (!duration || !onDismiss) return;
    const id = setTimeout(onDismiss, duration);
    return () => clearTimeout(id);
  }, [duration, onDismiss]);

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
      role="status"
      aria-live="polite"
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
