import * as React from 'react';
import { cn } from '../utils/cn.js';
import { Tabs, TabsList, TabsTrigger } from '../components/shadcn/tabs.js';
import { Badge } from '../components/shadcn/badge.js';

export interface ListToolbarTab {
  value: string;
  label: string;
  badgeCount?: number;
  disabled?: boolean;
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
        'flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-2 bg-surface-canvas sticky top-0 z-10',
        className,
      )}
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

      {action !== undefined && (
        <div className="shrink-0">{action}</div>
      )}
    </div>
  );
}

ListToolbar.displayName = 'ListToolbar';
