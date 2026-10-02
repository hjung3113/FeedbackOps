import { type NavResolveResponse, navResolveResponseSchema } from '@fops/shared';

import type { NavCounts } from '../layout/AppSidebar';
import { UnauthenticatedError } from './auth';
import { apiRequest } from './client';

export interface NavCountsResponse {
  counts: NavCounts;
}

/**
 * The `Partial<Record<...>>` count type intentionally preserves an omitted key.
 * `undefined` means no visible backing queue; zero is a visible, empty queue.
 */
export async function fetchNavCounts(options?: {
  managedSystemId?: string;
  signal?: AbortSignal;
}): Promise<NavCountsResponse> {
  const params = new URLSearchParams();
  if (options?.managedSystemId) params.set('managed_system_id', options.managedSystemId);
  const init: RequestInit = { credentials: 'same-origin' };
  if (options?.signal) init.signal = options.signal;
  const res = await fetch(`/nav/counts${params.size ? `?${params.toString()}` : ''}`, init);
  if (res.status === 401) throw new UnauthenticatedError();
  if (!res.ok) throw new Error(`/nav/counts failed: ${res.status}`);
  return (await res.json()) as NavCountsResponse;
}

/**
 * Command palette display-id resolution (#611): `GET /nav/resolve?display_id=`
 * per docs/implementation/api/navigation.md. Missing, foreign-workspace, and
 * not-readable records all arrive as the identical `404 not_found.record`
 * ApiError; malformed ids are `422 validation.failed`.
 */
export async function fetchNavResolve(
  displayId: string,
  options?: { signal?: AbortSignal },
): Promise<NavResolveResponse> {
  const response = await apiRequest(
    'GET',
    `/nav/resolve?display_id=${encodeURIComponent(displayId)}`,
    navResolveResponseSchema,
    {
      ...(options?.signal !== undefined ? { signal: options.signal } : {}),
    },
  );
  return response.data;
}
