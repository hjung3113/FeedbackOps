import * as React from 'react';
import { cn } from '../utils/cn.js';

export interface PanelSectionTitleProps {
  children: React.ReactNode;
  inset?: 'default' | 'panel';
  size?: 'default' | 'tiny';
  className?: string;
}

export function PanelSectionTitle({
  children,
  inset = 'default',
  size = 'default',
  className,
}: PanelSectionTitleProps) {
  return (
    <h3
      className={cn(
        'text-xs font-semibold uppercase tracking-wide text-text-muted mb-3.5',
        inset === 'panel' && 'px-4',
        size === 'tiny' && 'text-tiny',
        className,
      )}
    >
      {children}
    </h3>
  );
}
