import * as React from 'react';
import { cn } from '../../utils/cn.js';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: 'default' | 'compact';
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, padding = 'default', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border border-border-subtle bg-surface-card text-text-primary shadow-sm',
        padding === 'compact' && 'p-3.5',
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn('text-2xl font-semibold leading-none tracking-tight text-text-primary', className)}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-text-muted', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: 'default' | 'none';
}

export const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, padding = 'default', ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', padding === 'none' && 'p-0', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  ),
);
CardFooter.displayName = 'CardFooter';
