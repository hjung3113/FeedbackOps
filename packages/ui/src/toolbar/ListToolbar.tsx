import type * as React from 'react';
import { cn } from '../utils/cn.js';
import { ListTabs } from './ListTabs.js';
import type { ListToolbarTab } from './ListTabs.js';

export type { ListToolbarTab } from './ListTabs.js';

export interface ListToolbarProps {
  title?: string;
  tabs?: ListToolbarTab[];
  activeTab?: string;
  onTabChange?: (next: string) => void;
  tabsAriaLabel?: string;
  action?: React.ReactNode;
  className?: string;
}

export function ListToolbar({
  title,
  tabs,
  activeTab,
  onTabChange,
  tabsAriaLabel,
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
      <div className="flex min-w-0 flex-1 items-center">
        {tabs !== undefined ? (
          <ListTabs
            tabs={tabs}
            {...(activeTab !== undefined ? { activeTab } : {})}
            {...(onTabChange !== undefined ? { onTabChange } : {})}
            {...(tabsAriaLabel !== undefined ? { ariaLabel: tabsAriaLabel } : {})}
          />
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
