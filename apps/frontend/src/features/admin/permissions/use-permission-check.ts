// TanStack Query hook for GET /me/permissions/check.
//
// Keyed on `(capability, managed_system_id|null)` so multiple gates on the
// same screen with different scopes don't collide. Per AGENTS.md:69 the
// frontend never enforces backend permissions as truth — this hook only
// surfaces what the server returned.

import { useQuery } from '@tanstack/react-query';

import { type PermissionCheckResponse, fetchPermissionCheck } from '../../../lib/api.js';

export interface UsePermissionCheckArgs {
  capability: string;
  managedSystemId?: string;
}

export function permissionCheckQueryKey(args: UsePermissionCheckArgs) {
  return ['permission-check', args.capability, args.managedSystemId ?? null] as const;
}

export function usePermissionCheck(args: UsePermissionCheckArgs) {
  return useQuery<PermissionCheckResponse>({
    queryKey: permissionCheckQueryKey(args),
    queryFn: ({ signal }) =>
      fetchPermissionCheck(args.capability, {
        ...(args.managedSystemId !== undefined ? { managedSystemId: args.managedSystemId } : {}),
        signal,
      }),
    retry: false,
    // The decision is allowed to change as soon as admins flip a grant; we
    // don't aggressively poll, but we also don't cache stale forever.
    staleTime: 30_000,
  });
}
