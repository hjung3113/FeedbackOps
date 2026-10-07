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

/** Token class pair preserves the shipped entity mark colors. */
export const ENTITY_ICON_MAP: Record<EntityIconType, { letter: string; className: string }> = {
  voc: { letter: 'V', className: 'bg-entity-icon-voc text-entity-icon-foreground-light' },
  evidence: {
    letter: 'E',
    className: 'bg-entity-icon-evidence text-entity-icon-foreground-light',
  },
  finding: {
    letter: 'F',
    className: 'bg-entity-icon-finding text-entity-icon-foreground-dark',
  },
  request: {
    letter: 'R',
    className: 'bg-entity-icon-request text-entity-icon-foreground-dark',
  },
  task: { letter: 'T', className: 'bg-entity-icon-task text-entity-icon-foreground-light' },
  survey: { letter: 'S', className: 'bg-entity-icon-survey text-entity-icon-foreground-light' },
  outcome: { letter: 'O', className: 'bg-entity-icon-survey text-entity-icon-foreground-light' },
};

/**
 * Colored letter glyph badge.
 * Default size is 22 px (matches prototype). Border-radius is 4 px when
 * size ≤ 18 px, else 6 px.
 */
export function EntityIconBadge({ type, size = 22, className }: EntityIconBadgeProps) {
  const entry = ENTITY_ICON_MAP[type] ?? {
    letter: '?',
    className: 'bg-border-subtle text-text-on-accent',
  };
  const radius = size <= 18 ? 4 : 6;
  const fontSize = Math.max(8, Math.round(size * 0.45));

  return (
    <span
      className={cn(
        'inline-flex h-(--entity-icon-size) w-(--entity-icon-size) shrink-0 items-center justify-center rounded-(--entity-icon-radius) text-(length:--entity-icon-font-size) font-semibold leading-none select-none',
        entry.className,
        className,
      )}
      style={
        {
          '--entity-icon-size': `${size}px`,
          '--entity-icon-font-size': `${fontSize}px`,
          '--entity-icon-radius': `${radius}px`,
        } as React.CSSProperties
      }
      data-entity-type={type}
      aria-label={type}
    >
      {entry.letter}
    </span>
  );
}
