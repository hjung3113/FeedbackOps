import * as React from 'react';
import { cn } from '../utils/cn.js';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'py-6 gap-2 text-sm',
  md: 'py-12 gap-3 text-base',
  lg: 'py-20 gap-4 text-lg',
} as const;

export function EmptyState({
  icon,
  title,
  body,
  action,
  size = 'md',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        SIZE_CLASSES[size],
        className,
      )}
    >
      {icon !== undefined && (
        <div className="text-text-muted" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="font-medium text-text-primary">{title}</p>
      {body !== undefined && (
        <p className="text-text-muted">{body}</p>
      )}
      {action !== undefined && (
        <div>{action}</div>
      )}
    </div>
  );
}

EmptyState.displayName = 'EmptyState';
