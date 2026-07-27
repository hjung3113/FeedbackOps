import * as React from 'react';
import {
  Bell,
  Boxes,
  ClipboardList,
  FileBarChart,
  Shield,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { cn } from '@fops/ui';

export type RailDomain = 'voc' | 'findings' | 'tasks' | 'integration' | 'surveys' | 'admin';

export const RAIL_ITEMS: Array<{
  key: RailDomain;
  label: string;
  href: string;
  icon: React.ElementType<{ className?: string }>;
}> = [
  { key: 'voc', label: 'VOC', href: '/vocs?view=inbox', icon: UsersRound },
  { key: 'findings', label: 'Findings', href: '/findings', icon: FileBarChart },
  { key: 'tasks', label: 'Tasks', href: '/tasks?view=board', icon: ClipboardList },
  { key: 'integration', label: 'Integration', href: '/integration', icon: Boxes },
  { key: 'surveys', label: 'Surveys', href: '/surveys', icon: FileBarChart },
  { key: 'admin', label: 'Admin', href: '/admin/managed-systems', icon: Shield },
];

export function railForPathname(pathname: string): RailDomain {
  if (pathname.startsWith('/vocs') || pathname.startsWith('/voc-clusters')) return 'voc';
  if (pathname.startsWith('/findings')) return 'findings';
  if (pathname.startsWith('/tasks')) return 'tasks';
  if (pathname.startsWith('/integration')) return 'integration';
  if (pathname.startsWith('/surveys')) return 'surveys';
  return 'admin';
}

export interface AppRailProps {
  activeDomain?: RailDomain;
  className?: string;
}

/** 52px global domain selector. The sidebar owns the selected domain's tree. */
export function AppRail({ activeDomain = 'voc', className }: AppRailProps) {
  const head = RAIL_ITEMS.filter((item) => item.key !== 'admin');
  const admin = RAIL_ITEMS.find((item) => item.key === 'admin');

  return (
    <nav
      className={cn(
        'flex flex-col items-center gap-2 py-3 bg-surface-sidebar border-r border-border-subtle',
        className,
      )}
      style={{ width: 'var(--rail-width)' }}
      aria-label="System selector"
      data-testid="app-rail"
    >
      <div
        className="mb-1 flex h-8 w-8 items-center justify-center rounded-md bg-accent-primary text-xs font-semibold text-white"
        title="FeedbackOps"
        aria-label="FeedbackOps"
      >
        F
      </div>
      {head.map((item) => (
        <RailButton key={item.key} item={item} active={activeDomain === item.key} />
      ))}
      {admin && <div className="my-1 w-6 border-t border-border-subtle" aria-hidden="true" />}
      {admin && <RailButton item={admin} active={activeDomain === admin.key} />}
      <div className="flex-1" />
      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-row-hover hover:text-text-primary"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
      </button>
      <div
        className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-primary/15 text-xs font-semibold text-accent-primary"
        title="Profile"
        aria-label="Profile"
      >
        <UserRound className="h-4 w-4" />
      </div>
    </nav>
  );
}

function RailButton({
  item,
  active,
}: {
  item: (typeof RAIL_ITEMS)[number];
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <a
      href={item.href}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-row-hover hover:text-text-primary',
        active && 'bg-surface-row-selected text-accent-primary',
      )}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      data-testid={`rail-${item.key}`}
      title={item.label}
    >
      <Icon className="h-4 w-4" />
    </a>
  );
}
