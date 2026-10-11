import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as React from 'react';
import { cn } from '../../utils/cn.js';
import { POPPER_CONTENT_MOTION } from '../../utils/motion.js';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

type PopoverContentPadding = 'default' | 'compact' | 'none';

interface PopoverContentProps
  extends React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> {
  padding?: PopoverContentPadding;
}

const POPOVER_CONTENT_PADDING_CLASSES: Record<PopoverContentPadding, string> = {
  default: 'p-4',
  compact: 'p-1',
  none: 'p-0',
};

export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(({ className, align = 'center', sideOffset = 4, padding = 'default', ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'z-50 w-72 rounded-md border border-border-subtle bg-surface-popover text-text-primary shadow-md outline-hidden',
        POPPER_CONTENT_MOTION,
        POPOVER_CONTENT_PADDING_CLASSES[padding],
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;
