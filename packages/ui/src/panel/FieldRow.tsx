import * as React from 'react';
import { cn } from '../utils/cn.js';

export interface FieldRowProps {
  label: string;
  children: React.ReactNode;
  className?: string;
}

export function FieldRow({ label, children, className }: FieldRowProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 px-4 py-2 text-sm',
        className,
      )}
    >
      <span className="text-text-muted shrink-0">{label}</span>
      <div className="text-text-primary text-right">{children}</div>
    </div>
  );
}
