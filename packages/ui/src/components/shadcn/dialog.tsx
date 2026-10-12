import * as DialogPrimitive from '@radix-ui/react-dialog';
import { type VariantProps, cva } from 'class-variance-authority';
import { X } from 'lucide-react';
import * as React from 'react';
import { cn } from '../../utils/cn.js';
import { DIALOG_CONTENT_MOTION, SCRIM_MOTION } from '../../utils/motion.js';
import { isToastTarget } from '../../utils/toast-target.js';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  closeLabel?: string;
}

// #1050 command palette: accent-tinted, blurred scrim instead of the default black.
const dialogOverlayVariants = cva('fixed inset-0 z-50 bg-black/80', {
  variants: {
    variant: {
      palette: 'z-60 bg-accent-primary/16 backdrop-blur-xs',
    },
  },
});

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay> &
    VariantProps<typeof dialogOverlayVariants>
>(({ className, variant, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(dialogOverlayVariants({ variant }), SCRIM_MOTION, className)}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, closeLabel = '닫기', onInteractOutside, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border border-border-subtle bg-surface-card p-6 shadow-lg',
        DIALOG_CONTENT_MOTION,
        'sm:rounded-lg',
        className,
      )}
      {...props}
      onInteractOutside={(event) => {
        if (isToastTarget(event.target)) event.preventDefault();
        onInteractOutside?.(event);
      }}
    >
      {children}
      <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-surface-canvas transition-opacity hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-focus-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-surface-card data-[state=open]:text-text-muted">
        <X className="h-4 w-4" />
        <span className="sr-only">{closeLabel}</span>
      </DialogClose>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

// #1050 command palette panel: the prototype .cmdk-panel surface, owned here so
// app code styles the primitive only through the named variant.
const dialogContentBareVariants = cva('', {
  variants: {
    variant: {
      palette: cn(
        // oxlint-disable-next-line shadcn/no-arbitrary-values -- the palette panel keeps the 10px radius of the prototype .cmdk-panel (styles.css:865)
        'fixed left-1/2 top-[14vh] z-60 flex max-h-[72vh] w-[640px] max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col overflow-hidden rounded-[10px] border border-border-subtle bg-surface-popover shadow-xl',
        DIALOG_CONTENT_MOTION,
      ),
    },
  },
});

/**
 * Bare dialog content: portal + Radix content with no default chrome and no
 * close button, for dialog surfaces that own their styling and their
 * outside-interaction policy (command palette, #1050). The `palette` variant
 * carries the palette panel surface and its motion.
 */
export const DialogContentBare = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> &
    VariantProps<typeof dialogContentBareVariants>
>(({ children, className, variant, ...props }, ref) => (
  <DialogPortal>
    <DialogPrimitive.Content
      ref={ref}
      className={cn(dialogContentBareVariants({ variant }), className)}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContentBare.displayName = 'DialogContentBare';

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)}
      {...props}
    />
  );
}
DialogHeader.displayName = 'DialogHeader';

interface DialogFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  spacing?: 'default' | 'compact';
}

export function DialogFooter({ className, spacing = 'default', ...props }: DialogFooterProps) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
        spacing === 'compact' && 'gap-2 sm:gap-2',
        className,
      )}
      {...props}
    />
  );
}
DialogFooter.displayName = 'DialogFooter';

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight text-text-primary', className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-text-muted', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;
