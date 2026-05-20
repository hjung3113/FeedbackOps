import * as React from 'react';
import { Badge } from '../components/shadcn/badge.js';
import { cn } from '../utils/cn.js';

export interface OutlineBadgeProps
  extends Omit<React.ComponentPropsWithoutRef<typeof Badge>, 'variant'> {
  children: React.ReactNode;
}

/**
 * Thin pass-through over shadcn `<Badge variant="outline">`.
 * Adds nothing but a stable export name for consumers and a landing
 * pad for future token tweaks.
 */
export function OutlineBadge({ children, className, ...rest }: OutlineBadgeProps) {
  return (
    <Badge variant="outline" className={cn(className)} {...rest}>
      {children}
    </Badge>
  );
}
