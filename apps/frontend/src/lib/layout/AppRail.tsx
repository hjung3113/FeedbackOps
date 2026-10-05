import { logout } from '@/lib/api/auth';
import { useMe } from '@/lib/auth/useMe';
import { ROLE_LEVEL_DISPLAY_LABELS } from '@/lib/copy/enum-labels';
import { HOME_INBOX_COPY } from '@/lib/copy/home';
import {
  formatUnreadBadge,
  useUnreadNotificationCount,
} from '@/lib/cross-system/useUnreadNotificationCount';
import type { RoleLevel } from '@fops/shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from '@fops/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  Bell,
  Boxes,
  ClipboardList,
  FileBarChart,
  House,
  Shield,
  UserRound,
  UsersRound,
} from 'lucide-react';
import * as React from 'react';
import type { NavCounts } from './AppSidebar';

export type RailDomain =
  | 'home'
  | 'voc'
  | 'findings'
  | 'tasks'
  | 'integration'
  | 'surveys'
  | 'admin';

export const RAIL_ITEMS: Array<{
  key: RailDomain;
  label: string;
  href: string;
  icon: React.ElementType<{ className?: string }>;
}> = [
  { key: 'home', label: '홈', href: '/home', icon: House },
  { key: 'voc', label: 'VOC', href: '/vocs?view=inbox', icon: UsersRound },
  { key: 'findings', label: 'Findings', href: '/findings', icon: FileBarChart },
  { key: 'tasks', label: 'Tasks', href: '/tasks?view=board', icon: ClipboardList },
  { key: 'integration', label: '연동', href: '/integration', icon: Boxes },
  { key: 'surveys', label: 'Surveys', href: '/surveys/participate', icon: FileBarChart },
  { key: 'admin', label: '관리자', href: '/admin/managed-systems', icon: Shield },
];

export function railForPathname(pathname: string): RailDomain {
  if (pathname === '/home') return 'home';
  if (pathname.startsWith('/vocs') || pathname.startsWith('/voc-clusters')) return 'voc';
  if (pathname.startsWith('/findings')) return 'findings';
  if (pathname.startsWith('/tasks')) return 'tasks';
  if (pathname.startsWith('/integration')) return 'integration';
  if (pathname.startsWith('/surveys')) return 'surveys';
  return 'admin';
}

export interface AppRailProps {
  activeDomain?: RailDomain;
  canAccessWorkspaceAdmin?: boolean;
  counts?: NavCounts;
  className?: string;
}

/** 52px global domain selector. The sidebar owns the selected domain's tree. */
export function AppRail({
  activeDomain = 'voc',
  canAccessWorkspaceAdmin = false,
  counts,
  className,
}: AppRailProps) {
  const head = RAIL_ITEMS.filter((item) => item.key !== 'admin');
  const admin = RAIL_ITEMS.find((item) => item.key === 'admin');
  const { data: me } = useMe();
  const vocHref =
    counts === undefined || counts['voc.inbox'] !== undefined
      ? '/vocs?view=inbox'
      : '/vocs?view=my';
  const unreadNotificationCount = useUnreadNotificationCount();
  const unreadCount = unreadNotificationCount.data;
  const unreadBadge =
    unreadCount !== undefined && unreadCount > 0 ? formatUnreadBadge(unreadCount) : undefined;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
    } catch {
      // Navigation still ends the local session when the revoke request cannot finish.
    } finally {
      queryClient.clear();
      // `replace` so Back cannot return to the previous actor's app shell. The
      // revoked session would not serve it data, but a stale render of another
      // actor's screen is exactly the boundary a logout is meant to draw.
      // Wrapped rather than chained directly: navigate's return value is not
      // part of the contract we rely on here.
      void Promise.resolve(navigate({ to: '/login', replace: true })).catch(() => {
        // Only on failure: the success path unmounts this rail. Without this the
        // menu item stays disabled forever and the user cannot retry.
        setIsLoggingOut(false);
      });
    }
  }

  return (
    <nav
      className={cn(
        'flex flex-col items-center gap-2 py-3 bg-surface-sidebar border-r border-border-subtle',
        'w-(--rail-width)',
        className,
      )}
      aria-label="시스템 선택"
      data-testid="app-rail"
    >
      <div
        className="mb-1 flex h-8 w-8 items-center justify-center rounded-md bg-accent-primary text-xs font-semibold text-white"
        title="FeedbackOps"
        aria-label="FeedbackOps"
      >
        F
      </div>
      <TooltipProvider delayDuration={400}>
        {head.map((item) => (
          <RailButton
            key={item.key}
            item={item}
            active={activeDomain === item.key}
            href={item.key === 'voc' ? vocHref : item.href}
          />
        ))}
        {canAccessWorkspaceAdmin && admin && (
          <div className="my-1 w-6 border-t border-border-subtle" aria-hidden="true" />
        )}
        {canAccessWorkspaceAdmin && admin && (
          <RailButton item={admin} active={activeDomain === admin.key} />
        )}
      </TooltipProvider>
      <div className="flex-1" />
      {/* Plain anchor like the RailButton entries above (the rail renders outside routes in tests too). */}
      <a
        href="/home?tab=inbox"
        className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-row-hover hover:text-text-primary"
        aria-label={HOME_INBOX_COPY.railNotificationsLabel(unreadCount)}
      >
        <span className="relative inline-flex">
          <Bell className="h-4 w-4" />
          {unreadBadge !== undefined && (
            <span className="absolute -right-3 -top-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-danger px-1 text-micro font-semibold leading-none text-white">
              {unreadBadge}
            </span>
          )}
        </span>
      </a>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-primary/15 text-xs font-semibold text-accent-primary"
            title="프로필"
            aria-label="프로필"
          >
            <UserRound className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="center">
          {/* `/me` can answer without an `actor` — guarding only on `me` here
              crashed the whole frame through the error boundary, which is
              strictly worse than showing no label. The rail must survive any
              /me shape; logout below stays reachable either way. */}
          {me?.actor && (
            <DropdownMenuLabel>
              {me.actor.display_name} ·{' '}
              {ROLE_LEVEL_DISPLAY_LABELS[me.actor.role_level as RoleLevel]}
            </DropdownMenuLabel>
          )}
          <DropdownMenuItem disabled={isLoggingOut} onSelect={handleLogout}>
            로그아웃
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}

function RailButton({
  item,
  active,
  href = item.href,
}: {
  item: (typeof RAIL_ITEMS)[number];
  active: boolean;
  href?: string;
}) {
  const Icon = item.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={href}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-row-hover hover:text-text-primary',
            'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring',
            active && 'bg-surface-row-selected text-accent-primary',
          )}
          aria-label={item.label}
          aria-current={active ? 'page' : undefined}
          data-testid={`rail-${item.key}`}
        >
          <Icon className="h-4 w-4" />
        </a>
      </TooltipTrigger>
      <TooltipContent side="right" size="sm">
        {item.label}
      </TooltipContent>
    </Tooltip>
  );
}
