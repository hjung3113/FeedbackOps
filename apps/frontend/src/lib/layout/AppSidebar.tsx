import { cn } from '@fops/ui';
import { ChevronDown, ChevronLeft, ChevronRight, Settings, Shield, UserPlus } from 'lucide-react';
import * as React from 'react';

export type NavCounts = Partial<Record<NavCountKey, number>>;
export type NavCountKey =
  | 'voc.inbox'
  | 'voc.triage'
  | 'voc.my'
  | 'voc.tab.high'
  | 'voc.tab.unassigned'
  | 'voc.tab.no-link'
  | 'voc.clusters'
  | 'findings.all'
  | 'surveys.all';

export interface SidebarNavEntry {
  id: string;
  label: string;
  href: string;
  section?: string;
  icon?: React.ReactNode;
  active?: boolean;
  countKey?: NavCountKey;
  urgent?: boolean;
}

export interface SidebarFooterItem {
  id: string;
  label: string;
  href?: string;
  icon: React.ReactNode;
  disabled?: boolean;
}

export interface ManagedSystemScopeOption {
  id: string;
  name: string;
  granted: boolean;
}

export interface AppSidebarProps {
  entries: SidebarNavEntry[];
  footerItems?: SidebarFooterItem[];
  systemLabel?: string;
  systemSubtitle?: string;
  className?: string;
  defaultCollapsed?: boolean;
  counts?: NavCounts;
  managedSystems?: ManagedSystemScopeOption[];
  selectedManagedSystemId?: string;
  isAdmin?: boolean;
  onManagedSystemChange?: (managedSystemId: string | undefined) => void;
}

const STORAGE_KEY = 'appSidebarCollapsed';
const DEFAULT_FOOTER_ITEMS: SidebarFooterItem[] = [
  { id: 'invite-member', label: 'Invite member', icon: <UserPlus className="h-4 w-4" />, disabled: true },
  { id: 'workspace-settings', label: 'Workspace settings', href: '/admin/settings', icon: <Settings className="h-4 w-4" /> },
];

function readInitialCollapsed(defaultValue: boolean): boolean {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? defaultValue : stored === '1';
  } catch {
    return defaultValue;
  }
}

export function AppSidebar({
  entries,
  footerItems = DEFAULT_FOOTER_ITEMS,
  systemLabel = 'VOC',
  systemSubtitle = 'Voice of Customer',
  className,
  defaultCollapsed = false,
  counts = {},
  managedSystems = [],
  selectedManagedSystemId,
  isAdmin = true,
  onManagedSystemChange,
}: AppSidebarProps) {
  const [collapsed, setCollapsed] = React.useState(() => readInitialCollapsed(defaultCollapsed));
  const [scopeOpen, setScopeOpen] = React.useState(false);
  const selectedSystem = managedSystems.find((system) => system.id === selectedManagedSystemId);
  const grantedSystems = managedSystems.filter((system) => system.granted);
  const isUnion = !isAdmin && selectedManagedSystemId === undefined;

  const toggle = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const selectScope = (managedSystemId: string | undefined) => {
    onManagedSystemChange?.(managedSystemId);
    setScopeOpen(false);
  };

  return (
    <aside
      className={cn('flex flex-col border-r border-border-subtle bg-surface-sidebar transition-[width] duration-150', className)}
      style={{ width: collapsed ? 'var(--sidebar-width-collapsed)' : 'var(--sidebar-width)' }}
      aria-label="Primary navigation"
      data-testid="app-sidebar"
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      <div className="flex items-center justify-between border-b border-border-subtle px-3" style={{ height: 'var(--topbar-height)' }}>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-text-primary" data-testid="sidebar-system-label">{systemLabel}</div>
            <div className="truncate text-[10px] text-text-muted" data-testid="sidebar-system-subtitle">{systemSubtitle}</div>
          </div>
        )}
        <button type="button" onClick={toggle} className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:text-text-primary" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} data-testid="sidebar-collapse-toggle">
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
      {!collapsed && (
        <div className="relative border-b border-border-subtle p-2">
          <button type="button" className="flex w-full items-center gap-2 rounded-md border border-border-subtle px-2 py-2 text-left text-sm hover:bg-surface-row-hover" onClick={() => setScopeOpen((open) => !open)} aria-expanded={scopeOpen} aria-haspopup="listbox" data-testid="scope-selector">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-accent-primary/15 text-xs font-semibold text-accent-primary">{selectedSystem ? selectedSystem.name.slice(0, 1) : '∗'}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 truncate font-medium">
                {selectedSystem?.name ?? 'All Managed Systems'}
                {isUnion && <ScopeBadge testId="scope-union-badge" label="union" />}
                {selectedSystem && !selectedSystem.granted && <ScopeBadge testId="scope-out-of-scope-badge" label="out of scope" urgent />}
              </span>
              {isUnion && grantedSystems.length > 0 && <span className="block truncate text-[10px] text-text-muted">{grantedSystems.map((system) => system.name).join(' · ')}</span>}
            </span>
            <ChevronDown className="h-3 w-3 shrink-0 text-text-muted" />
          </button>
          {scopeOpen && (
            <div className="absolute left-2 right-2 top-full z-50 mt-1 rounded-md border border-border-subtle bg-surface-popover p-1 shadow-lg" role="listbox" aria-label="Managed System scope">
              <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-row-hover" onClick={() => selectScope(undefined)} data-testid="scope-option-all">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-accent-primary/15 text-xs text-accent-primary">∗</span>
                <span className="min-w-0 flex-1"><span className="block font-medium">All Managed Systems</span><span className="block text-[10px] text-text-muted">{isAdmin ? 'workspace-wide' : `union · ${grantedSystems.length} system${grantedSystems.length === 1 ? '' : 's'}`}</span></span>
              </button>
              {managedSystems.map((system) => (
                <button key={system.id} type="button" className={cn('flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-row-hover', !system.granted && 'opacity-55')} onClick={() => selectScope(system.id)} data-testid={`scope-option-${system.id}`}>
                  <span className="flex h-5 w-5 items-center justify-center rounded bg-surface-row-selected text-xs font-semibold">{system.name.slice(0, 1)}</span>
                  <span className="min-w-0 flex-1 truncate">{system.name}</span>
                  {!system.granted && <Shield className="h-3 w-3 text-text-muted" aria-label="Outside your grants" />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        <div className="flex flex-col gap-0.5">
          {entries.map((entry, index) => {
            const showSection = !collapsed && entry.section !== undefined && entry.section !== entries[index - 1]?.section;
            const count = entry.countKey === undefined ? undefined : counts[entry.countKey];
            return <React.Fragment key={entry.id}>
              {showSection && entry.section !== undefined && <div className={cn('mx-2 mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-disabled', index === 0 ? 'mt-1.5' : 'mt-3.5')} data-testid={`sidebar-section-${sectionTestId(entry.section)}`}>{entry.section}</div>}
              <a href={scopedHref(entry.href, selectedManagedSystemId)} className={navItemClass(collapsed, entry.active)} data-testid={`sidebar-nav-${entry.id}`} aria-current={entry.active ? 'page' : undefined} title={collapsed ? entry.label : undefined} aria-label={collapsed ? entry.label : undefined}>
                {entry.icon && <span className="shrink-0">{entry.icon}</span>}
                {!collapsed && <span className="min-w-0 flex-1 truncate">{entry.label}</span>}
                {!collapsed && count !== undefined && <NavCountBadge entryId={entry.id} count={count} {...(entry.urgent === true ? { urgent: true } : {})} />}
              </a>
            </React.Fragment>;
          })}
        </div>
      </nav>
      <div className="border-t border-border-subtle p-2"><div className="flex flex-col gap-0.5">{footerItems.map((item) => <SidebarFooterLink key={item.id} item={item} collapsed={collapsed} />)}</div></div>
    </aside>
  );
}

function NavCountBadge({ entryId, count, urgent }: { entryId: string; count: number; urgent?: boolean }) {
  return <span className={cn('rounded-full bg-surface-row-selected px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-text-secondary', urgent && 'bg-accent-danger/15 text-accent-danger')} data-testid={`sidebar-count-${entryId}`}>{count}</span>;
}

function ScopeBadge({ testId, label, urgent = false }: { testId: string; label: string; urgent?: boolean }) {
  return <span className={cn('inline-flex items-center gap-0.5 rounded-full bg-accent-primary/10 px-1 py-0.5 text-[9px] font-medium text-accent-primary', urgent && 'bg-accent-danger/15 text-accent-danger')} data-testid={testId}>{label}</span>;
}

function SidebarFooterLink({ item, collapsed }: { item: SidebarFooterItem; collapsed: boolean }) {
  const props = { className: cn(navItemClass(collapsed), item.disabled && 'opacity-60 cursor-not-allowed'), 'data-testid': `sidebar-footer-${item.id}`, title: collapsed ? item.label : undefined, 'aria-label': collapsed ? item.label : undefined };
  if (item.href && !item.disabled) return <a href={item.href} {...props}><span className="shrink-0">{item.icon}</span>{!collapsed && <span className="truncate">{item.label}</span>}</a>;
  return <button type="button" disabled={item.disabled} {...props}><span className="shrink-0">{item.icon}</span>{!collapsed && <span className="truncate">{item.label}</span>}</button>;
}

function navItemClass(collapsed: boolean, active = false) { return cn('flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-row-hover hover:text-text-primary', collapsed && 'justify-center px-0', active && 'bg-surface-row-selected text-text-primary'); }
function sectionTestId(section: string) { return section.toLowerCase().replace(/\s+/g, '-'); }
function scopedHref(href: string, managedSystemId: string | undefined) {
  if (managedSystemId === undefined || !href.startsWith('/vocs')) return href;
  const url = new URL(href, 'http://feedbackops.local');
  url.searchParams.set('managedSystem', managedSystemId);
  return `${url.pathname}?${url.searchParams.toString()}`;
}
