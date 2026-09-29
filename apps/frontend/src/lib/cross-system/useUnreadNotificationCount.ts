import { useQuery } from '@tanstack/react-query';

import { fetchUnreadNotificationCount, notificationsQueryKey } from '@/lib/api/notifications';

export function useUnreadNotificationCount() {
  const query = useQuery({
    queryKey: [...notificationsQueryKey, 'unread-count'] as const,
    queryFn: ({ signal }) => fetchUnreadNotificationCount(signal),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  return { ...query, data: query.isError ? undefined : query.data };
}

export function formatUnreadBadge(unreadCount: number): string {
  return unreadCount > 99 ? '99+' : String(unreadCount);
}
