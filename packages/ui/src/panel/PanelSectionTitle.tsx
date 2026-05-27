import * as React from 'react';
import { cn } from '../utils/cn.js';

export interface PanelSectionTitleProps {
  children: React.ReactNode;
  className?: string;
}

export function PanelSectionTitle({ children, className }: PanelSectionTitleProps) {
  return (
    <h3
      className={cn(
        'text-xs font-semibold uppercase tracking-wide text-text-muted mb-3.5',
        className,
      )}
    >
      {children}
    </h3>
  );
}
