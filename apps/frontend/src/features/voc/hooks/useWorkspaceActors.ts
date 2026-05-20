// useWorkspaceActors.ts — cached query for workspace actor list.
// Endpoint: GET /actors?workspace=current
// Used by OwnerPicker to load assignable workspace members.
// Threshold rule (D-2.1): ≤5 candidates → RadioGroup mode; >5 → Combobox mode.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
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
      const res = await apiClient<WorkspaceActorsPage>(
        'GET',
        '/actors?workspace=current',
        { signal },
      );
      return res.data;
    },
    staleTime: 60_000,
    retry: 1,
  });

  return {
    ...query,
    actors: query.data?.actors,
  };
}
