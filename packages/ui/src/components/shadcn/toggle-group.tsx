import * as React from 'react';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../utils/cn.js';

const toggleGroupItemVariants = cva(
  'inline-flex items-center justify-center text-sm font-medium transition-colors',
  {
    variants: {
      variant: {
        default:
          'bg-transparent hover:bg-surface-card hover:text-text-primary data-[state=on]:bg-surface-card data-[state=on]:text-text-primary',
        outline:
          'border border-border-subtle bg-transparent hover:bg-surface-card hover:text-text-primary data-[state=on]:bg-surface-card data-[state=on]:text-text-primary',
      },
      size: {
        default: 'h-10 px-3',
        sm: 'h-9 px-2.5',
        lg: 'h-11 px-5',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

type ToggleGroupContext = VariantProps<typeof toggleGroupItemVariants>;
const ToggleGroupContext = React.createContext<ToggleGroupContext>({
  size: 'default',
  variant: 'default',
});

type ToggleGroupAppearance = 'default' | 'filter';
type ToggleGroupProps = React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleGroupItemVariants> & {
    appearance?: ToggleGroupAppearance;
  };

const TOGGLE_GROUP_APPEARANCE_CLASSES: Record<Exclude<ToggleGroupAppearance, 'default'>, string> = {
  filter: 'rounded-md border border-border-subtle bg-surface-card p-0.5',
};

type ToggleGroupItemAppearance = 'default' | 'selected-filter';
interface ToggleGroupItemProps
  extends React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item> {
  appearance?: ToggleGroupItemAppearance;
}

const TOGGLE_GROUP_ITEM_APPEARANCE_CLASSES: Record<
  Exclude<ToggleGroupItemAppearance, 'default'>,
  string
> = {
  'selected-filter':
    'data-[state=on]:border-border-selected data-[state=on]:bg-surface-row-selected data-[state=on]:text-text-primary data-[state=on]:font-semibold',
};

export const ToggleGroup = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Root>,
  ToggleGroupProps
>(({ className, variant, size, appearance = 'default', children, ...props }, ref) => (
  <ToggleGroupPrimitive.Root
    ref={ref}
    className={cn(
      'flex items-center justify-center gap-1',
      appearance !== 'default' && TOGGLE_GROUP_APPEARANCE_CLASSES[appearance],
      className,
    )}
    {...props}
  >
    <ToggleGroupContext.Provider value={{ variant, size }}>
      {children}
    </ToggleGroupContext.Provider>
  </ToggleGroupPrimitive.Root>
));
ToggleGroup.displayName = ToggleGroupPrimitive.Root.displayName;

export const ToggleGroupItem = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  ToggleGroupItemProps & VariantProps<typeof toggleGroupItemVariants>
>(({ className, children, variant, size, appearance = 'default', ...props }, ref) => {
  const context = React.useContext(ToggleGroupContext);
  return (
    <ToggleGroupPrimitive.Item
      ref={ref}
      className={cn(
        toggleGroupItemVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        appearance !== 'default' && TOGGLE_GROUP_ITEM_APPEARANCE_CLASSES[appearance],
        className,
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  );
});
ToggleGroupItem.displayName = ToggleGroupPrimitive.Item.displayName;
