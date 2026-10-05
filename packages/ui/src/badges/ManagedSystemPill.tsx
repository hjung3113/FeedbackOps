/**
 * ManagedSystemPill — outline pill: border + rounded-full + name + 6 px round color dot.
 *
 * C1 design contract: this component takes the RESOLVED data directly.
 * Callers resolve `mark` from the Managed System slug with
 * `managedSystemMarkColor`, keeping this package primitive free of data fetching.
 * This keeps `@fops/ui` free of domain data-fetching per AGENTS.md.
 *
 * A known record with an unsupported slug gets the neutral default token.
 * A missing record can omit `mark` and renders in the muted version.
 */
import type * as React from 'react';
import { cn } from '../utils/cn.js';

export interface ManagedSystemPillProps {
  name: string;
  /** CSS color string for the 6 px round "mark" dot, resolved by slug in the caller. */
  mark?: string;
  /** When true, renders in a muted style (e.g. archived or unknown system). */
  archived?: boolean;
  className?: string;
}

/**
 * Outline pill for a Managed System reference.
 * Renders a small 6 px round colored dot prefix ("mark") when `mark` is provided.
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
        isMuted && 'opacity-60',
        className,
      )}
      data-archived={archived === true ? 'true' : 'false'}
      {...(mark !== undefined
        ? { style: { '--managed-system-pill-mark-color': mark } as React.CSSProperties }
        : {})}
    >
      {mark !== undefined && (
        <span
          className="inline-block size-1.5 shrink-0 rounded-pill bg-(--managed-system-pill-mark-color)"
          aria-hidden="true"
          data-mark={mark}
        />
      )}
      {name}
    </span>
  );
}
