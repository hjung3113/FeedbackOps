import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../utils/cn.js';

// Per ADR-0016: variant surface constrained to component-inventory.md.
// `outline`, `ghost`, `link` not exposed; add them via inventory + ADR follow-up.
type Variant = 'primary' | 'secondary' | 'subtle' | 'destructive';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-accent-primary text-text-inverse hover:opacity-90',
  secondary: 'bg-surface-raised text-text-primary hover:bg-surface-overlay',
  subtle: 'bg-transparent text-text-muted hover:text-text-primary',
  destructive: 'bg-accent-danger text-text-primary hover:opacity-90',
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled === true || loading}
      aria-busy={loading}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'min-h-10 min-w-10', // ADR-0016 touch target
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
    >
      {children}
    </button>
  );
}
