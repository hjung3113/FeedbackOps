/**
 * ManagedSystemPill — outline pill: border + rounded-full + name + 12 px color square.
 *
 * C1 design contract: this component takes the RESOLVED data directly.
 * The `useManagedSystem(id)` hook (C6, features/voc/hooks/) computes
 * `mark` from an id-hash → fixed palette and passes it in. This keeps
 * `@fops/ui` free of domain data-fetching per AGENTS.md.
 *
 * Unknown id pattern: caller passes `name: 'Unknown MS'` with no `mark`
 * → renders muted version.
 */
import * as React from 'react';
import { cn } from '../utils/cn.js';

export interface ManagedSystemPillProps {
  name: string;
  /** CSS color string for the 12 px square "mark". Computed by caller via id-hash palette. */
  mark?: string;
  /** When true, renders in a muted style (e.g. archived or unknown system). */
  archived?: boolean;
  className?: string;
}

/**
 * Outline pill for a Managed System reference.
 * Renders a small 12 px colored square prefix ("mark") when `mark` is provided.
 * Passes `archived` as a data attribute for testability.
 */
export function ManagedSystemPill({ name, mark, archived, className }: ManagedSystemPillProps) {
  const isMuted = archived === true || mark === undefined;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        isMuted
          ? 'border-border-subtle text-text-muted'
          : 'border-border-subtle text-text-secondary',
        className,
      )}
      data-archived={archived === true ? 'true' : 'false'}
      style={isMuted ? { opacity: 0.6 } : undefined}
    >
      {mark !== undefined && (
        <span
          style={{
            display: 'inline-block',
            width: 12,
            height: 12,
            borderRadius: 2,
            backgroundColor: mark,
            flexShrink: 0,
          }}
          aria-hidden="true"
          data-mark={mark}
        />
      )}
      {name}
    </span>
  );
}
