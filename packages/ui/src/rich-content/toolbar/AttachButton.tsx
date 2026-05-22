// AttachButton — pure UI control for the RichEditor Attach action.
//
// PLAN-22 C8. Renders an icon button with a hidden <input type="file"> sibling;
// click (or Enter/Space activation) opens the file picker. On selection,
// invokes `onPick(file)`. While `onPick` returns a pending promise, the
// button shows a spinner and is disabled — concurrent picks are not allowed.
//
// This component owns ZERO domain knowledge — it does not call APIs, does not
// know about attachment_ids, and does not touch the editor. Wiring happens in
// the surface-specific toolbar render-prop.

import { Loader2, Paperclip } from 'lucide-react';
import * as React from 'react';
import { cn } from '../../utils/cn';

export interface AttachButtonProps {
  /**
   * Called with the picked File when the user selects one.
   * If it returns a promise, the button shows a loading spinner until it
   * settles. Errors are NOT caught here — the caller surfaces a toast.
   */
  onPick: (file: File) => void | Promise<unknown>;
  /** MIME hint for the native picker `accept` attribute. */
  accept?: string;
  disabled?: boolean;
  /** Accessible label. Defaults to '첨부 파일 추가' (PLAN-22 C8 acceptance). */
  label?: string;
  className?: string;
  /** Optional test id for surface-specific assertion. */
  'data-testid'?: string;
}

export function AttachButton({
  onPick,
  accept,
  disabled,
  label = '첨부 파일 추가',
  className,
  'data-testid': testId,
}: AttachButtonProps): React.ReactElement {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [pending, setPending] = React.useState(false);

  const openPicker = React.useCallback((): void => {
    if (disabled || pending) return;
    inputRef.current?.click();
  }, [disabled, pending]);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    // Reset the input so picking the same file twice still fires `change`.
    e.target.value = '';
    if (!file) return;
    const result = onPick(file);
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      setPending(true);
      try {
        await result;
      } finally {
        setPending(false);
      }
    }
  };

  const isDisabled = disabled === true || pending;

  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-busy={pending || undefined}
        disabled={isDisabled}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPicker();
          }
        }}
        data-testid={testId}
        className={cn(
          'inline-flex items-center justify-center h-7 w-7 rounded text-text-secondary',
          'hover:bg-surface-row-hover hover:text-text-primary',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary',
          'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
          className,
        )}
      >
        {pending ? (
          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
        ) : (
          <Paperclip size={14} aria-hidden="true" />
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        data-testid={testId ? `${testId}-input` : undefined}
      />
    </>
  );
}
