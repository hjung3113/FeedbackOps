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
        'text-xs font-medium uppercase tracking-wide text-text-muted px-4 pt-4 pb-2 border-t border-border-subtle',
        className,
      )}
    >
      {children}
    </h3>
  );
}
