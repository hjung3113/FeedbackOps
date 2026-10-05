import * as React from 'react';
import { cn } from '../../utils/cn.js';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  shape?: 'default' | 'rounded';
}

export function Skeleton({ className, shape = 'default', ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-surface-blocked',
        shape === 'rounded' && 'rounded',
        className,
      )}
      {...props}
    />
  );
}
Skeleton.displayName = 'Skeleton';
