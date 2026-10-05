import * as React from 'react';
import { cn } from '../utils/cn.js';

export interface FieldRowProps {
  label: string;
  children: React.ReactNode;
  inset?: 'default' | 'none';
  layout?: 'default' | 'property';
  className?: string;
}

const INSET_CLASSES = {
  default: '',
  none: 'px-0',
} as const;

const LAYOUT_CLASSES = {
  default: '',
  property: 'grid grid-cols-[120px_1fr] items-start gap-3 px-0 text-sm [&>div]:text-left',
} as const;

export function FieldRow({
  label,
  children,
  inset = 'default',
  layout = 'default',
  className,
}: FieldRowProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 px-4 py-2 text-sm',
        INSET_CLASSES[inset],
        LAYOUT_CLASSES[layout],
        className,
      )}
    >
      <span className="text-text-muted shrink-0">{label}</span>
      <div className="text-text-primary text-right">{children}</div>
    </div>
  );
}
