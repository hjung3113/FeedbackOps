import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { Circle } from 'lucide-react';
import * as React from 'react';
import { cn } from '../../utils/cn.js';

type RadioGroupAppearance = 'default' | 'segmented';

interface RadioGroupProps extends React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root> {
  appearance?: RadioGroupAppearance;
}

interface RadioGroupItemProps
  extends React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item> {
  appearance?: RadioGroupAppearance;
}

const RADIO_GROUP_APPEARANCE_CLASSES: Record<Exclude<RadioGroupAppearance, 'default'>, string> = {
  segmented:
    'inline-flex h-auto w-auto items-center justify-start gap-0.5 rounded-md bg-surface-canvas p-0.5 text-text-muted shadow-subtle',
};

const RADIO_GROUP_ITEM_APPEARANCE_CLASSES: Record<
  Exclude<RadioGroupAppearance, 'default'>,
  string
> = {
  segmented:
    'inline-flex items-center justify-center whitespace-nowrap ring-offset-surface-canvas transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=checked]:shadow-sm flex-none gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium data-[state=checked]:bg-surface-card-elevated data-[state=checked]:text-text-primary data-[state=checked]:shadow-subtle',
};

export const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  RadioGroupProps
>(({ className, appearance = 'default', ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Root
      className={cn(
        'grid gap-2',
        appearance !== 'default' && RADIO_GROUP_APPEARANCE_CLASSES[appearance],
        className,
      )}
      {...props}
      ref={ref}
    />
  );
});
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName;

export const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  RadioGroupItemProps
>(({ className, appearance = 'default', children, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        appearance === 'segmented'
          ? RADIO_GROUP_ITEM_APPEARANCE_CLASSES[appearance]
          : 'aspect-square h-4 w-4 rounded-full border border-border-strong text-accent-primary',
        appearance === 'default' &&
          'focus:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2',
        appearance === 'default' && 'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {appearance === 'segmented' ? (
        children
      ) : (
        <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
          <Circle className="h-2.5 w-2.5 fill-current text-current" />
        </RadioGroupPrimitive.Indicator>
      )}
    </RadioGroupPrimitive.Item>
  );
});
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;
