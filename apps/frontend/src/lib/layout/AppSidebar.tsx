import { cn } from '@fops/ui';
import { ChevronLeft, ChevronRight, Settings, UserPlus } from 'lucide-react';
import * as React from 'react';

export interface SidebarNavEntry {
  id: string;
  label: string;
  href: string;
  section?: string;
  icon?: React.ReactNode;
  active?: boolean;
}

export interface SidebarFooterItem {
  id: string;
  label: string;
  href?: string;
  icon: React.ReactNode;
  disabled?: boolean;
}

export interface AppSidebarProps {
  entries: SidebarNavEntry[];
  footerItems?: SidebarFooterItem[];
  workspaceName?: string;
  className?: string;
  /** Override initial collapsed state (for tests / SSR). */
  defaultCollapsed?: boolean;
}

const STORAGE_KEY = 'appSidebarCollapsed';
const DEFAULT_FOOTER_ITEMS: SidebarFooterItem[] = [
  {
    id: 'invite-member',
    label: 'Invite member',
    icon: <UserPlus className="h-4 w-4" />,
    disabled: true,
  },
  {
    id: 'workspace-settings',
    label: 'Workspace settings',
    href: '/admin/settings',
    icon: <Settings className="h-4 w-4" />,
  },
];

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
  footerItems = DEFAULT_FOOTER_ITEMS,
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
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        <div className="flex flex-col gap-0.5">
          {entries.map((e, index) => {
            const section = e.section;
            const showSection =
              !collapsed && section !== undefined && section !== entries[index - 1]?.section;

            return (
              <React.Fragment key={e.id}>
                {showSection && (
                  <div
                    className={cn(
                      'mx-2 mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-disabled',
                      index === 0 ? 'mt-1.5' : 'mt-3.5',
                    )}
                    data-testid={`sidebar-section-${sectionTestId(section)}`}
                  >
                    {section}
                  </div>
                )}
                <a
                  href={e.href}
                  className={navItemClass(collapsed, e.active)}
                  data-testid={`sidebar-nav-${e.id}`}
                  aria-current={e.active ? 'page' : undefined}
                  title={collapsed ? e.label : undefined}
                  aria-label={collapsed ? e.label : undefined}
                >
                  {e.icon && <span className="shrink-0">{e.icon}</span>}
                  {!collapsed && <span className="truncate">{e.label}</span>}
                </a>
              </React.Fragment>
            );
          })}
        </div>
      </nav>
      <div className="border-t border-border-subtle p-2">
        <div className="flex flex-col gap-0.5">
          {footerItems.map((item) => (
            <SidebarFooterLink key={item.id} item={item} collapsed={collapsed} />
          ))}
        </div>
      </div>
    </aside>
  );
}

function SidebarFooterLink({
  item,
  collapsed,
}: {
  item: SidebarFooterItem;
  collapsed: boolean;
}) {
  const commonProps = {
    className: cn(navItemClass(collapsed), item.disabled && 'opacity-60 cursor-not-allowed'),
    'data-testid': `sidebar-footer-${item.id}`,
    title: collapsed ? item.label : undefined,
    'aria-label': collapsed ? item.label : undefined,
  };

  if (item.href && !item.disabled) {
    return (
      <a href={item.href} {...commonProps}>
        <span className="shrink-0">{item.icon}</span>
        {!collapsed && <span className="truncate">{item.label}</span>}
      </a>
    );
  }

  return (
    <button type="button" disabled={item.disabled} {...commonProps}>
      <span className="shrink-0">{item.icon}</span>
      {!collapsed && <span className="truncate">{item.label}</span>}
    </button>
  );
}

function navItemClass(collapsed: boolean, active = false) {
  return cn(
    'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-row-hover hover:text-text-primary',
    collapsed && 'justify-center px-0',
    active && 'bg-surface-row-selected text-text-primary',
  );
}

function sectionTestId(section: string) {
  return section.toLowerCase().replace(/\s+/g, '-');
}
