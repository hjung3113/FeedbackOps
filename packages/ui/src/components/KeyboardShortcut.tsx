import type * as React from 'react';
import { cn } from '../utils/cn.js';

export interface KeyboardShortcutProps {
  children: React.ReactNode;
  className?: string;
  testId?: string;
}

const SHORTCUT_CLASS =
  'rounded-sm border border-border-subtle bg-surface-row-hover px-1.25 py-px font-mono text-caption leading-body text-text-muted';

/** Compact keyboard hint shared by navigation and the command palette. */
export function KeyboardShortcut({ children, className, testId }: KeyboardShortcutProps) {
  return (
    <span
      className={cn(SHORTCUT_CLASS, className)}
      {...(testId !== undefined ? { 'data-testid': testId } : {})}
    >
      {children}
    </span>
  );
}
