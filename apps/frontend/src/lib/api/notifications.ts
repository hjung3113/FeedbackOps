import {
  listNotificationsResponseSchema,
  notificationDtoSchema,
  type ListNotificationsResponse,
  type NotificationDto,
} from '@fops/shared';

import { apiRequest } from './client';

export const notificationsQueryKey = ['notifications'] as const;

export interface FetchNotificationsOptions {
  unread?: boolean;
  limit?: number;
  cursor?: string;
  signal?: AbortSignal;
}

export async function fetchNotifications(
  options: FetchNotificationsOptions = {},
): Promise<ListNotificationsResponse> {
  const params = new URLSearchParams();
  if (options.unread !== undefined) params.set('unread', String(options.unread));
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.cursor !== undefined) params.set('cursor', options.cursor);
  const query = params.size > 0 ? `?${params.toString()}` : '';
  const response = await apiRequest(
    'GET',
    `/notifications${query}`,
    listNotificationsResponseSchema,
    { ...(options.signal !== undefined ? { signal: options.signal } : {}) },
  );
  return response.data;
}

export async function markNotificationRead(id: string): Promise<NotificationDto> {
  const response = await apiRequest('POST', `/notifications/${id}/read`, notificationDtoSchema);
  return response.data;
}

export async function archiveNotification(id: string): Promise<NotificationDto> {
  const response = await apiRequest('POST', `/notifications/${id}/archive`, notificationDtoSchema);
  return response.data;
}

export async function fetchUnreadNotificationCount(signal?: AbortSignal): Promise<number> {
  const response = await fetchNotifications({
    unread: true,
    limit: 1,
    ...(signal !== undefined ? { signal } : {}),
  });
  return response.unread_count;
}
