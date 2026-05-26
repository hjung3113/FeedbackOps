import { cn } from '@fops/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';

export interface SidebarNavEntry {
  id: string;
  label: string;
  href: string;
  icon?: React.ReactNode;
  active?: boolean;
}

export interface AppSidebarProps {
  entries: SidebarNavEntry[];
  workspaceName?: string;
  className?: string;
  /** Override initial collapsed state (for tests / SSR). */
  defaultCollapsed?: boolean;
}

const STORAGE_KEY = 'appSidebarCollapsed';

function readInitialCollapsed(defaultValue: boolean): boolean {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) return defaultValue;
    return stored === '1';
  } catch {
    return defaultValue;
  }
}

export function AppSidebar({
  entries,
  workspaceName = 'FeedbackOps',
  className,
  defaultCollapsed = false,
}: AppSidebarProps) {
  const [collapsed, setCollapsed] = React.useState(() => readInitialCollapsed(defaultCollapsed));

  const toggle = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return (
    <aside
      className={cn(
        'flex flex-col border-r border-border-subtle bg-surface-sidebar transition-[width] duration-150',
        className,
      )}
      style={{
        width: collapsed ? 'var(--sidebar-width-collapsed)' : 'var(--sidebar-width)',
      }}
      aria-label="Primary navigation"
      data-testid="app-sidebar"
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      <div
        className="flex items-center justify-between border-b border-border-subtle px-3"
        style={{ height: 'var(--topbar-height)' }}
      >
        {!collapsed && (
          <span className="text-sm font-semibold text-text-primary truncate">{workspaceName}</span>
        )}
        <button
          type="button"
          onClick={toggle}
          className="ml-auto w-7 h-7 rounded-md flex items-center justify-center text-text-muted hover:text-text-primary"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          data-testid="sidebar-collapse-toggle"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        <ul className="flex flex-col gap-0.5">
          {entries.map((e) => (
            <li key={e.id}>
              <a
                href={e.href}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 text-sm rounded-md mx-2 text-text-secondary hover:bg-surface-row-hover hover:text-text-primary',
                  collapsed && 'justify-center px-0 mx-1',
                  e.active && 'bg-surface-row-selected text-text-primary',
                )}
                data-testid={`sidebar-nav-${e.id}`}
                aria-current={e.active ? 'page' : undefined}
                title={collapsed ? e.label : undefined}
                aria-label={collapsed ? e.label : undefined}
              >
                {e.icon && <span className="shrink-0">{e.icon}</span>}
                {!collapsed && <span className="truncate">{e.label}</span>}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
