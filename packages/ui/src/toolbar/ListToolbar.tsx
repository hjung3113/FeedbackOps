import type * as React from 'react';
import { Badge } from '../components/shadcn/badge.js';
import { Tabs, TabsList, TabsTrigger } from '../components/shadcn/tabs.js';
import { cn } from '../utils/cn.js';

export interface ListToolbarTab {
  value: string;
  label: string;
  badgeCount?: number;
  disabled?: boolean;
  /**
   * Urgent affordance — renders the trigger label in the danger token (red)
   * to flag an attention-needed queue (e.g. VOC inbox "Unassigned"). Mirrors
   * the prototype's `urgent: true` tab flag.
   */
  urgent?: boolean;
}

export interface ListToolbarProps {
  title?: string;
  tabs?: ListToolbarTab[];
  activeTab?: string;
  onTabChange?: (next: string) => void;
  action?: React.ReactNode;
  className?: string;
}

export function ListToolbar({
  title,
  tabs,
  activeTab,
  onTabChange,
  action,
  className,
}: ListToolbarProps) {
  return (
    <div
      className={cn(
        'flex h-toolbar items-center justify-between gap-3 border-b border-border-subtle px-4 bg-surface-canvas sticky top-0 z-10',
        className,
      )}
      data-toolbar-height="50"
    >
      <div className="flex items-center min-w-0">
        {tabs !== undefined ? (
          <Tabs
            {...(activeTab !== undefined ? { value: activeTab } : {})}
            {...(onTabChange !== undefined ? { onValueChange: onTabChange } : {})}
          >
            <TabsList>
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  disabled={tab.disabled}
                  className={cn(tab.urgent === true && 'text-danger')}
                >
                  {tab.label}
                  {tab.badgeCount !== undefined && tab.badgeCount > 0 && (
                    <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-xs">
                      {tab.badgeCount}
                    </Badge>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : (
          title !== undefined && (
            <h2 className="text-sm font-semibold text-text-primary truncate">{title}</h2>
          )
        )}
      </div>

      {action !== undefined && <div className="shrink-0">{action}</div>}
    </div>
  );
}

ListToolbar.displayName = 'ListToolbar';
