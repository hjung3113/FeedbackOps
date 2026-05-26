import type * as React from 'react';
import { cn } from '../utils/cn.js';

export interface PanelTitleBlockProps {
  title: string;
  badges?: React.ReactNode;
  className?: string;
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

export function PanelTitleBlock({ title, badges, className, size = 'lg' }: PanelTitleBlockProps) {
  const titleClass =
    size === 'xl'
      ? 'text-xl font-bold tracking-tight text-text-primary'
      : 'text-lg font-semibold tracking-tight leading-[1.35] text-text-primary';

  return (
    <div className={cn('flex flex-col gap-2 px-4 py-3', className)}>
      <h2 className={titleClass}>{title}</h2>
      {badges !== undefined && <div className="flex flex-wrap gap-2">{badges}</div>}
    </div>
  );
}
