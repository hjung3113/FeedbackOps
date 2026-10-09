import type * as React from 'react';
import { cn } from '../utils/cn.js';

export interface PanelTitleBlockProps {
  title: string;
  titleTabIndex?: number;
  badges?: React.ReactNode;
  className?: string;
  inset?: 'default' | 'none';
  /**
   * Title typography variant.
   * - 'lg' (default): `text-lg font-semibold tracking-tight leading-[1.35]` — prototype `.panel-title`.
   * - 'xl': `text-xl font-bold tracking-tight` — restored hero treatment per
   *   `.review/title-reference.png` for legacy consumers.
   *
   * Default is `'lg'` to preserve existing consumers; opt in to `'xl'` per surface.
   */
  size?: 'lg' | 'xl';
}

export function PanelTitleBlock({
  title,
  titleTabIndex,
  badges,
  className,
  inset = 'default',
  size = 'lg',
}: PanelTitleBlockProps) {
  const titleClass =
    size === 'xl'
      ? 'text-xl font-bold tracking-tight text-text-primary'
      : // oxlint-disable-next-line shadcn/no-arbitrary-values -- panel titles preserve the prototype's 1.35 line-height for the compact heading wrap
        'text-lg font-semibold tracking-tight leading-[1.35] text-text-primary';

  return (
    <div
      className={cn('flex flex-col gap-2 px-4 py-3', inset === 'none' && 'px-0! py-0!', className)}
    >
      <h2
        className={cn(
          titleClass,
          titleTabIndex !== undefined &&
            'ring-offset-surface-canvas focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2',
        )}
        tabIndex={titleTabIndex}
      >
        {title}
      </h2>
      {badges !== undefined && <div className="flex flex-wrap gap-2">{badges}</div>}
    </div>
  );
}
