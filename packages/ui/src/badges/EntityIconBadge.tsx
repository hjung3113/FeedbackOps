import type * as React from 'react';
import { cn } from '../utils/cn.js';

export type EntityIconType =
  | 'voc'
  | 'evidence'
  | 'finding'
  | 'request'
  | 'task'
  | 'survey'
  | 'outcome';

export interface EntityIconBadgeProps {
  type: EntityIconType;
  size?: number;
  className?: string;
}

/**
 * Verbatim from `ENTITY_ICON_MAP` in `docs/design-prototype/components.jsx`.
 * Hex values are locked by the prototype and must not be replaced with tokens.
 */
export const ENTITY_ICON_MAP: Record<
  EntityIconType,
  { letter: string; bg: string; color: string }
> = {
  voc:      { letter: 'V', bg: '#5e6ad2', color: 'white' },
  evidence: { letter: 'E', bg: '#02b8cc', color: 'white' },
  finding:  { letter: 'F', bg: '#e4f222', color: '#08090a' },
  request:  { letter: 'R', bg: '#f2c46d', color: '#08090a' },
  task:     { letter: 'T', bg: '#27a644', color: 'white' },
  survey:   { letter: 'S', bg: '#8b5cf6', color: 'white' },
  outcome:  { letter: 'O', bg: '#8b5cf6', color: 'white' },
};

/**
 * Colored letter glyph badge.
 * Default size is 22 px (matches prototype). Border-radius is 4 px when
 * size ≤ 18 px, else 6 px.
 */
export function EntityIconBadge({ type, size = 22, className }: EntityIconBadgeProps) {
  const entry = ENTITY_ICON_MAP[type] ?? { letter: '?', bg: 'var(--color-charcoal-grey)', color: 'white' };
  const radius = size <= 18 ? 4 : 6;
  const fontSize = Math.max(8, Math.round(size * 0.45));

  return (
    <span
      className={cn(
        'inline-flex h-(--entity-icon-size) w-(--entity-icon-size) shrink-0 items-center justify-center rounded-(--entity-icon-radius) bg-(--entity-icon-bg) text-(--entity-icon-color) text-(length:--entity-icon-font-size) font-semibold leading-none select-none',
        className,
      )}
      style={
        {
          '--entity-icon-size': `${size}px`,
          '--entity-icon-font-size': `${fontSize}px`,
          // oxlint-disable-next-line shadcn/no-inline-styles -- background comes from the closed per-entity-type palette map above
          '--entity-icon-bg': entry.bg,
          // oxlint-disable-next-line shadcn/no-inline-styles -- foreground comes from the closed per-entity-type palette map above
          '--entity-icon-color': entry.color,
          '--entity-icon-radius': `${radius}px`,
        } as React.CSSProperties
      }
      data-entity-type={type}
      data-bg={entry.bg}
      data-color={entry.color}
      aria-label={type}
    >
      {entry.letter}
    </span>
  );
}
