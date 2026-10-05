import type { NotificationDto } from '@fops/shared';
import {
  Button,
  SkeletonRows,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@fops/ui';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Archive, Check } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { ListStateMessage } from '@/components/ListStateMessage';
import {
  type ApiError,
  archiveNotification,
  fetchNotifications,
  mapUnknownError,
  markNotificationRead,
  notificationsQueryKey,
} from '@/lib/api';
import { HOME_INBOX_COPY } from '@/lib/copy/home';
import { formatRelativeTime } from '@/lib/format/datetime';

type InboxFilter = 'unread' | 'all';

function vocTarget(notification: NotificationDto): string | null {
  const vocId = notification.detail['voc_id'];
  if (typeof vocId !== 'string') return null;
  return `/vocs?view=inbox&selected=${encodeURIComponent(vocId)}`;
}

export function notificationTarget(notification: NotificationDto): string | null {
  const subjectId = encodeURIComponent(notification.subject_id);
  switch (notification.event_type) {
    case 'voc.assigned_to_me':
    case 'voc.reporter_replied':
    case 'voc.severity_set_high_or_critical':
    case 'task.released':
      return vocTarget(notification);
    case 'task.assigned_to_me':
      return `/tasks?view=board&param=${subjectId}`;
    case 'task_request.approved':
    case 'task_request.rejected':
    case 'task_request.needs_more_evidence':
      return `/tasks?view=requests&param=${subjectId}`;
    case 'permission_request.submitted':
      return `/admin/permissions/requests?tab=all&selected=${subjectId}`;
    case 'permission_request.decided':
    case 'permission_grant.revoked':
      return null;
  }
}

function reportMutationError(error: ApiError): void {
  toast.error(mapUnknownError(error).message);
}

export function InboxPanel(): React.ReactElement {
  const [filter, setFilter] = React.useState<InboxFilter>('unread');
  const [pendingActionCounts, setPendingActionCounts] = React.useState<Record<string, number>>({});
  const queryClient = useQueryClient();
  const list = useInfiniteQuery({
    queryKey: [...notificationsQueryKey, 'list', filter] as const,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchNotifications({
        ...(filter === 'unread' ? { unread: true } : {}),
        ...(pageParam !== undefined ? { cursor: pageParam } : {}),
        signal,
      }),
    getNextPageParam: (lastPage) => (lastPage.page.has_more ? lastPage.page.cursor : undefined),
    retry: false,
  });
  const invalidateNotifications = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: notificationsQueryKey }).then(() => undefined);
  const updatePendingActionCount = (id: string, change: number): void => {
    setPendingActionCounts((current) => {
      const nextCount = (current[id] ?? 0) + change;
      if (nextCount <= 0) {
        const next = { ...current };
        delete next[id];
        return next;
      }
      return { ...current, [id]: nextCount };
    });
  };
  const markRead = useMutation<NotificationDto, ApiError, string>({
    mutationFn: markNotificationRead,
    onMutate: (id) => updatePendingActionCount(id, 1),
    onSettled: (_data, _error, id) => updatePendingActionCount(id, -1),
    onSuccess: invalidateNotifications,
    onError: reportMutationError,
  });
  const archive = useMutation<NotificationDto, ApiError, string>({
    mutationFn: archiveNotification,
    onMutate: (id) => updatePendingActionCount(id, 1),
    onSettled: (_data, _error, id) => updatePendingActionCount(id, -1),
    onSuccess: invalidateNotifications,
    onError: reportMutationError,
  });
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const rowActionPending = (id: string): boolean => (pendingActionCounts[id] ?? 0) > 0;

  return (
    <section className="space-y-3" data-testid="home-inbox-list">
      <ToggleGroup
        type="single"
        value={filter}
        onValueChange={(value) => {
          if (value === 'unread' || value === 'all') setFilter(value);
        }}
        variant="outline"
        size="sm"
        className="w-fit rounded-md border border-border-subtle bg-surface-card p-0.5"
        aria-label={HOME_INBOX_COPY.filterLabel}
      >
        <ToggleGroupItem value="unread" appearance="selected-filter">
          {HOME_INBOX_COPY.unread}
        </ToggleGroupItem>
        <ToggleGroupItem value="all" appearance="selected-filter">
          {HOME_INBOX_COPY.all}
        </ToggleGroupItem>
      </ToggleGroup>

      {list.isPending ? (
        <div className="space-y-2" aria-busy="true" data-testid="home-inbox-loading">
          <SkeletonRows count={3} size="compact" />
        </div>
      ) : null}

      {list.isError ? (
        <div className="flex items-center gap-3 py-5">
          <p className="text-sm text-accent-danger">{HOME_INBOX_COPY.error}</p>
          <Button variant="subtle" size="sm" onClick={() => void list.refetch()}>
            {HOME_INBOX_COPY.retry}
          </Button>
        </div>
      ) : null}

      {!list.isPending && !list.isError && items.length === 0 ? (
        <ListStateMessage
          variant="empty"
          title={filter === 'unread' ? HOME_INBOX_COPY.emptyUnread : HOME_INBOX_COPY.emptyAll}
        />
      ) : null}

      {!list.isPending && !list.isError && items.length > 0 ? (
        <TooltipProvider delayDuration={400}>
          <ul className="overflow-hidden rounded-md border border-border-subtle bg-surface-card">
            {items.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                actionsDisabled={rowActionPending(notification.id)}
                onMarkRead={() => markRead.mutate(notification.id)}
                onArchive={() => archive.mutate(notification.id)}
              />
            ))}
          </ul>
        </TooltipProvider>
      ) : null}

      {list.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="subtle"
            size="sm"
            disabled={list.isFetching}
            onClick={() => void list.fetchNextPage()}
          >
            {list.isFetchingNextPage ? HOME_INBOX_COPY.loadingMore : HOME_INBOX_COPY.loadMore}
          </Button>
        </div>
      )}
    </section>
  );
}

function NotificationRow({
  notification,
  actionsDisabled,
  onMarkRead,
  onArchive,
}: {
  notification: NotificationDto;
  actionsDisabled: boolean;
  onMarkRead: () => void;
  onArchive: () => void;
}): React.ReactElement {
  const target = notificationTarget(notification);
  const targetLocation = target === null ? null : new URL(target, 'http://feedbackops.local');
  const subjectTitle =
    notification.subject_ref?.visibility_state === 'allowed'
      ? notification.subject_ref.title
      : null;
  const titleTooltipOnArchive =
    subjectTitle !== null && targetLocation === null && notification.read_at !== null;
  const mainClassName = [
    'flex min-w-0 flex-1 items-center gap-3 pl-4 pr-2 text-left',
    notification.subject_ref ? 'py-1' : 'py-3',
  ].join(' ');
  const interactiveClassName = `${mainClassName} hover:bg-surface-row-hover`;
  const mainContent = (
    <>
      <span
        className={
          notification.read_at === null
            ? 'h-2 w-2 shrink-0 rounded-full bg-accent-primary'
            : 'h-2 w-2 shrink-0 rounded-full bg-transparent'
        }
        aria-hidden="true"
      />
      {notification.read_at === null && <span className="sr-only">{HOME_INBOX_COPY.unread}</span>}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="shrink-0 text-caption font-medium tracking-wide text-text-muted">
            {HOME_INBOX_COPY.categories[notification.subject_type]}
          </span>
          <span className="truncate text-sm text-text-primary">{notification.summary}</span>
        </span>
        {notification.subject_ref ? (
          <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-text-muted">
            {notification.subject_ref.visibility_state === 'allowed' ? (
              <>
                <span className="shrink-0 font-mono">{notification.subject_ref.display_id}</span>
                <span className="truncate">{notification.subject_ref.title}</span>
              </>
            ) : (
              <span>{HOME_INBOX_COPY.subjectUnavailable}</span>
            )}
          </span>
        ) : null}
      </span>
      <time className="shrink-0 text-xs text-text-muted" dateTime={notification.created_at}>
        {formatRelativeTime(notification.created_at)}
      </time>
      {target === null && notification.read_at === null && (
        <span className="sr-only"> — {HOME_INBOX_COPY.markAsRead}</span>
      )}
    </>
  );
  const onMainClick = (): void => {
    if (notification.read_at === null) onMarkRead();
  };
  const mainControl: React.ReactElement =
    targetLocation !== null ? (
      <Link
        to={targetLocation.pathname as never}
        search={Object.fromEntries(targetLocation.searchParams) as never}
        className={interactiveClassName}
        onClick={onMainClick}
      >
        {mainContent}
      </Link>
    ) : notification.read_at === null ? (
      <button type="button" className={interactiveClassName} onClick={onMainClick}>
        {mainContent}
      </button>
    ) : (
      <div className={mainClassName}>{mainContent}</div>
    );
  const archiveButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={HOME_INBOX_COPY.archive}
      disabled={actionsDisabled}
      onClick={onArchive}
    >
      <Archive className="h-4 w-4" />
    </Button>
  );

  return (
    <li
      className="flex min-h-row-default items-center border-b border-border-subtle last:border-b-0"
      data-testid={`home-inbox-row-${notification.id}`}
    >
      {subjectTitle === null || titleTooltipOnArchive ? (
        mainControl
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>{mainControl}</TooltipTrigger>
          <TooltipContent>{subjectTitle}</TooltipContent>
        </Tooltip>
      )}
      <span className="flex shrink-0 items-center gap-1 px-2">
        {notification.read_at === null && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={HOME_INBOX_COPY.markAsRead}
            disabled={actionsDisabled}
            onClick={onMarkRead}
          >
            <Check className="h-4 w-4" />
          </Button>
        )}
        {titleTooltipOnArchive && subjectTitle !== null ? (
          <Tooltip>
            <TooltipTrigger asChild>{archiveButton}</TooltipTrigger>
            <TooltipContent>{subjectTitle}</TooltipContent>
          </Tooltip>
        ) : (
          archiveButton
        )}
      </span>
    </li>
  );
}
