// useMe — react-query wrapper around /me.
// staleTime 5 min; retry false (auth guard in _authed.tsx handles 401 before
// any authed component mounts; if UnauthenticatedError somehow bubbles through,
// react-query surfaces it as query.error).

import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { fetchMe } from '@/lib/api';
import type { MeResponse } from '@/lib/api';

export type { MeResponse };

export function useMe(): UseQueryResult<MeResponse> {
  return useQuery<MeResponse>({
    queryKey: ['me'],
    queryFn: ({ signal }) => fetchMe(signal),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
