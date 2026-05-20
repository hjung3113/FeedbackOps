import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../utils/cn.js';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-accent-primary text-text-on-accent hover:bg-accent-primary/80',
        secondary:
          'border-transparent bg-surface-raised text-text-primary hover:bg-surface-raised/80',
        destructive:
          'border-transparent bg-accent-danger text-text-on-accent hover:bg-accent-danger/80',
        outline: 'text-text-primary border-border-subtle',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
Badge.displayName = 'Badge';

export { badgeVariants };
