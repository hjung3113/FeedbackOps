import { useQuery } from '@tanstack/react-query';

import { fetchUnreadNotificationCount, notificationsQueryKey } from '@/lib/api/notifications';

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: [...notificationsQueryKey, 'unread-count'] as const,
    queryFn: ({ signal }) => fetchUnreadNotificationCount(signal),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}
