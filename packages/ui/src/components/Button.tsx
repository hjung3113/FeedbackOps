import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '../utils/cn.js';

/**
 * Pack 17 shadcn-CVA Button. Per ADR-0021.
 *
 * Variant aliases: `primary` → `default`, `subtle` → `ghost` (preserved for back-compat from ADR-0016 Button).
 *
 * `loading` is incompatible with `asChild`. When both are true, throws in dev and logs a warning + degrades
 * silently in prod (renders the child WITHOUT the loading affordance). Radix Slot enforces single-child
 * contract that conflicts with spinner injection.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-surface-canvas transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-accent-primary text-text-on-accent hover:bg-accent-primary/90',
        secondary:
          'bg-surface-raised text-text-primary border border-border-subtle hover:bg-surface-card',
        destructive: 'bg-accent-danger text-text-on-accent hover:bg-accent-danger/90',
        outline:
          'border border-border-default bg-transparent text-text-primary hover:bg-surface-card',
        ghost: 'text-text-primary hover:bg-surface-card',
        link: 'text-accent-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3',
        md: 'h-10 px-4',
        lg: 'h-12 px-6',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);

type ShadcnVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
type LegacyVariant = 'primary' | 'subtle';
type ButtonVariant = ShadcnVariant | LegacyVariant;
type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>;

const VARIANT_ALIAS: Record<LegacyVariant, ShadcnVariant> = {
  primary: 'default',
  subtle: 'ghost',
};

function resolveVariant(v?: ButtonVariant): ShadcnVariant {
  if (!v) return 'default';
  if (v === 'primary' || v === 'subtle') return VARIANT_ALIAS[v];
  return v;
}

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  asChild?: boolean;
  children?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, loading, asChild = false, disabled, children, ...props },
    ref,
  ) => {
    if (asChild && loading) {
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(
          'Button: `loading` is incompatible with `asChild` — Slot enforces single-child contract.',
        );
      }
      console.warn(
        'Button: `loading` is incompatible with `asChild`; rendering child without loading affordance.',
      );
      const Comp = Slot;
      return (
        <Comp
          ref={ref as never}
          className={cn(
            buttonVariants({ variant: resolveVariant(variant), size }),
            className,
          )}
          {...props}
        >
          {children as React.ReactElement}
        </Comp>
      );
    }

    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref as never}
        className={cn(buttonVariants({ variant: resolveVariant(variant), size }), className)}
        aria-busy={loading ? 'true' : undefined}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
