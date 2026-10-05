import * as React from 'react';
import { cn } from '../utils/cn.js';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  density?: 'default' | 'compact';
  padding?: 'default' | 'wide';
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
  density = 'default',
  padding = 'default',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        SIZE_CLASSES[size],
        density === 'compact' && 'py-3 gap-0 text-xs',
        padding === 'wide' && 'px-6',
        className,
      )}
    >
      {icon !== undefined && (
        <div className="text-text-muted" aria-hidden="true">
          {icon}
        </div>
      )}
      <p
        className={size === 'sm' ? 'font-normal text-text-muted' : 'font-medium text-text-primary'}
      >
        {title}
      </p>
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
