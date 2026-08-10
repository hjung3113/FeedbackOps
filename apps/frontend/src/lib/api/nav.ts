import { UnauthenticatedError } from './auth';
import type { NavCounts } from '../layout/AppSidebar';

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
