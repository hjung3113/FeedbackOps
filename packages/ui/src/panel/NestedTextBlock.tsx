import * as React from 'react';
import { cn } from '../utils/cn.js';

export interface NestedTextBlockProps {
  children: React.ReactNode;
  className?: string;
}

export function NestedTextBlock({ children, className }: NestedTextBlockProps) {
  return (
    <div
      className={cn(
        'rounded-md border border-border-subtle bg-surface-canvas p-4',
        className,
      )}
    >
      {children}
    </div>
  );
}
