import * as React from 'react';
import { Inbox, Settings, User } from 'lucide-react';
import { cn } from '@fops/ui';

export interface AppRailProps {
  className?: string;
}

/**
 * 52px vertical rail. Workspace switcher placeholder + global utility icons.
 * Per-feature entries land in their own issue (AGENTS.md two-consumer rule). #18 ships placeholders.
 */
export function AppRail({ className }: AppRailProps) {
  return (
    <nav
      className={cn(
        'flex flex-col items-center gap-3 py-3 bg-surface-sidebar border-r border-border-subtle',
        className,
      )}
      style={{ width: 'var(--rail-width)' }}
      aria-label="Global rail"
      data-testid="app-rail"
    >
      <button
        type="button"
        className="w-8 h-8 rounded-md bg-surface-card border border-border-subtle flex items-center justify-center text-text-muted hover:text-text-primary"
        aria-label="Workspace switcher"
      >
        <span className="text-xs font-semibold">FO</span>
      </button>
      <div className="flex-1" />
      <button
        type="button"
        className="w-8 h-8 rounded-md flex items-center justify-center text-text-muted hover:text-text-primary"
        aria-label="Inbox"
      >
        <Inbox className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="w-8 h-8 rounded-md flex items-center justify-center text-text-muted hover:text-text-primary"
        aria-label="Settings"
      >
        <Settings className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="w-8 h-8 rounded-md flex items-center justify-center text-text-muted hover:text-text-primary"
        aria-label="Profile"
      >
        <User className="h-4 w-4" />
      </button>
    </nav>
  );
}
