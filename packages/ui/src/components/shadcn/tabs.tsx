import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '../../utils/cn.js';

export const Tabs = TabsPrimitive.Root;

type TabsListAppearance = 'default' | 'segmented';
type TabsTriggerAppearance = 'default' | 'segmented';

interface TabsListProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> {
  appearance?: TabsListAppearance;
}

interface TabsTriggerProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {
  appearance?: TabsTriggerAppearance;
}

const TABS_LIST_APPEARANCE_CLASSES: Record<Exclude<TabsListAppearance, 'default'>, string> = {
  segmented:
    'h-auto w-auto justify-start gap-0.5 rounded-md bg-surface-canvas p-0.5 text-text-muted shadow-subtle',
};

const TABS_TRIGGER_APPEARANCE_CLASSES: Record<Exclude<TabsTriggerAppearance, 'default'>, string> = {
  segmented:
    'flex-none gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium data-[state=active]:bg-surface-card-elevated data-[state=active]:text-text-primary data-[state=active]:shadow-subtle',
};

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  TabsListProps
>(({ className, appearance = 'default', ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex h-10 items-center justify-center rounded-md bg-surface-raised p-1 text-text-muted',
      appearance !== 'default' && TABS_LIST_APPEARANCE_CLASSES[appearance],
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  TabsTriggerProps
>(({ className, appearance = 'default', ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-surface-canvas transition-all',
      'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2',
      'disabled:pointer-events-none disabled:opacity-50',
      'data-[state=active]:bg-surface-card data-[state=active]:text-text-primary data-[state=active]:shadow-sm',
      appearance !== 'default' && TABS_TRIGGER_APPEARANCE_CLASSES[appearance],
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-2 ring-offset-surface-canvas',
      'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2',
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;
