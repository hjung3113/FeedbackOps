// Cached query for GET /actors?workspace=current.
//
// Single owner of query key ['actors', 'workspace', 'current']. The cached
// value is the canonical actor row (`id`, `display_name`, `email`,
// `role_level` per @fops/shared `listActorsResponseSchema`). Consumers that
// need a narrower list (owner picker `kind`, admin name lookup) project
// locally — they must not register another queryFn on this key.
//
// `kind: 'user' | 'team'` is an OwnerPicker taxonomy, not a BE field.
// ADR-0018: the actor list has no teams, so pickers that need `kind` map
// every row to `'user'` at the call site.

import { apiClient } from '@/lib/api';
import type { ListActorsResponse, RoleLevel } from '@fops/shared';
import { type UseQueryResult, useQuery } from '@tanstack/react-query';

export const workspaceActorsQueryKey = ['actors', 'workspace', 'current'] as const;

export interface WorkspaceActor {
  id: string;
  display_name: string;
  email: string;
  role_level: RoleLevel;
}

export interface WorkspaceActorsPage {
  actors: WorkspaceActor[];
}

export interface UseWorkspaceActorsOptions {
  enabled?: boolean;
  /** Default 60s. Pass 0 to keep the previous "refetch on mount" policy. */
  staleTime?: number;
  /** Default 1. Pass false for a single attempt. */
  retry?: number | boolean;
}

export type UseWorkspaceActorsResult = UseQueryResult<WorkspaceActorsPage> & {
  actors: WorkspaceActor[] | undefined;
};

export function useWorkspaceActors(
  options: UseWorkspaceActorsOptions = {},
): UseWorkspaceActorsResult {
  const query = useQuery<WorkspaceActorsPage>({
    queryKey: workspaceActorsQueryKey,
    enabled: options.enabled ?? true,
    staleTime: options.staleTime ?? 60_000,
    retry: options.retry ?? 1,
    queryFn: async ({ signal }) => {
      const res = await apiClient<ListActorsResponse>('GET', '/actors?workspace=current', {
        signal,
      });
      return {
        actors: res.data.actors.map((actor) => ({
          id: actor.id,
          display_name: actor.display_name,
          email: actor.email,
          role_level: actor.role_level,
        })),
      };
    },
  });

  return {
    ...query,
    actors: query.data?.actors,
  };
}
