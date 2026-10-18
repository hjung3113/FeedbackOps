// ComposerToolbarButton — the one formatting button shared by every composer toolbar.
// The onMouseDown guard keeps the editor's focus and selection when the button is clicked.

import { cn } from '@fops/ui';
import type * as React from 'react';

export function ComposerToolbarButton({
  onClick,
  isActive,
  disabled,
  title,
  children,
  'data-testid': testId,
}: {
  onClick: () => void;
  isActive: boolean;
  disabled: boolean;
  title: string;
  children: React.ReactNode;
  'data-testid'?: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        // Mouse only: stop the button from taking focus (and the selection) from the editor.
        e.preventDefault();
      }}
      // Native click covers mouse and Enter/Space; the command refocuses the editor itself.
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={isActive}
      data-testid={testId}
      className={cn(
        'inline-flex items-center justify-center h-7 w-7 rounded text-text-secondary',
        'hover:bg-surface-row-hover hover:text-text-primary',
        'disabled:cursor-not-allowed disabled:opacity-40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
        isActive && 'bg-surface-row-selected text-text-primary',
      )}
    >
      {children}
    </button>
  );
}
