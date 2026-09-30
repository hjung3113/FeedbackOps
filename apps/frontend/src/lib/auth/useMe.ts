// useMe — shared react-query wrapper for /me and the authenticated route guards.
// It reuses the five-minute cache and retries only 429 responses with a bounded delay.

import { useQuery } from '@tanstack/react-query';
import type { QueryClient, UseQueryResult } from '@tanstack/react-query';
import { fetchMe } from '@/lib/api';
import { MeRequestError } from '@/lib/api/auth';
import type { MeResponse } from '@/lib/api';

export type { MeResponse };

export const ME_QUERY_KEY = ['me'] as const;

const ME_STALE_TIME = 5 * 60 * 1000;
const MAX_429_RETRIES = 2;
const MAX_RETRY_DELAY = 5 * 1000;
const DEFAULT_RETRY_DELAY = 250;

function retryAfterMilliseconds(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const retryAt = Date.parse(trimmed);
  if (!Number.isFinite(retryAt)) return undefined;
  return Math.max(0, retryAt - Date.now());
}

function meRetryDelay(attemptIndex: number, error: unknown): number {
  if (error instanceof MeRequestError && error.retryAfter !== undefined) {
    const retryAfter = retryAfterMilliseconds(error.retryAfter);
    if (retryAfter !== undefined) return Math.min(MAX_RETRY_DELAY, retryAfter);
  }
  return Math.min(MAX_RETRY_DELAY, DEFAULT_RETRY_DELAY * 2 ** attemptIndex);
}

export function meQueryOptions() {
  return {
    queryKey: ME_QUERY_KEY,
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchMe(signal),
    staleTime: ME_STALE_TIME,
    retry: (failureCount: number, error: unknown) =>
      error instanceof MeRequestError && error.status === 429 && failureCount < MAX_429_RETRIES,
    retryDelay: meRetryDelay,
  } as const;
}

export function ensureMe(queryClient: QueryClient): Promise<MeResponse> {
  return queryClient.ensureQueryData(meQueryOptions());
}

export function useMe(): UseQueryResult<MeResponse> {
  return useQuery<MeResponse>(meQueryOptions());
}
