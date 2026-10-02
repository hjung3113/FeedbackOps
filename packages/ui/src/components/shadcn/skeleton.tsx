import * as React from 'react';
import { cn } from '../../utils/cn.js';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-surface-blocked', className)}
      {...props}
    />
  );
}
Skeleton.displayName = 'Skeleton';
