import * as React from 'react';
import { Skeleton } from '@fops/ui';
import { cn } from '@fops/ui';

export interface VocRowSkeletonProps {
  className?: string;
}

/**
 * Skeleton placeholder row — same 60px (h-15) + px-4 frame as VocRow.
 * Three internal Skeleton bars approximate: severity indicator / title / meta.
 */
export function VocRowSkeleton({ className }: VocRowSkeletonProps) {
  return (
    <div
      role="row"
      aria-busy="true"
      className={cn('flex w-full items-center gap-3 px-4 h-15', className)}
    >
      {/* Severity bar approximation */}
      <Skeleton className="h-4 w-3 shrink-0 rounded-sm" />
      {/* Title + meta */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5 justify-center">
        <Skeleton className="h-3.5 w-2/3 rounded" />
        <Skeleton className="h-2.5 w-1/3 rounded" />
      </div>
    </div>
  );
}

VocRowSkeleton.displayName = 'VocRowSkeleton';
