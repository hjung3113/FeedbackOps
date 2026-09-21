// useWorkspaceActors.ts — cached query for workspace actor list.
// Endpoint: GET /actors?workspace=current
// Used by OwnerPicker to load assignable workspace members.
// Threshold rule (D-2.1): ≤5 candidates → RadioGroup mode; >5 → Combobox mode.
//
// BE returns the canonical actor shape (`{id, display_name, email,
// role_level}` per @fops/shared `listActorsResponseSchema`). The OwnerPicker
// UI taxonomy uses `kind: 'user' | 'team'`; today the data model has no
// `team` actors (ADR-0018 teams stub) so every BE row maps to `kind: 'user'`.
// When teams ship, derive `kind` from the BE row instead of hardcoding.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ListActorsResponse } from '@fops/shared';
import { apiClient } from '@/lib/api';

export type ActorKind = 'user' | 'team';

export interface WorkspaceActor {
  id: string;
  display_name: string;
  kind: ActorKind;
}

export interface WorkspaceActorsPage {
  actors: WorkspaceActor[];
}

export type UseWorkspaceActorsResult = UseQueryResult<WorkspaceActorsPage> & {
  actors: WorkspaceActor[] | undefined;
};

/**
 * Fetches the list of workspace actors available for VOC owner assignment.
 * Query key includes 'current' workspace sentinel; re-fetch when workspace changes.
 */
export function useWorkspaceActors(): UseWorkspaceActorsResult {
  const query = useQuery<WorkspaceActorsPage>({
    queryKey: ['actors', 'workspace', 'current'] as const,
    queryFn: async ({ signal }) => {
      const res = await apiClient<ListActorsResponse>(
        'GET',
        '/actors?workspace=current',
        { signal },
      );
      return {
        actors: res.data.actors.map((a) => ({
          id: a.id,
          display_name: a.display_name,
          kind: 'user' as const,
        })),
      };
    },
    staleTime: 60_000,
    retry: 1,
  });

  return {
    ...query,
    actors: query.data?.actors,
  };
}
