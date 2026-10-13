import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CoverageThresholds } from '@fops/shared';

import { type ApiError, apiClient } from '../../../lib/api';

export type PermissionSelfApproval = 'allowed' | 'forbidden';

export interface WorkspaceSettings {
  coverage_thresholds: CoverageThresholds;
  permission_self_approval: PermissionSelfApproval;
  survey_anonymity_threshold: number;
}

// The Coverage PATCH is a partial per-metric map of complete pairs; the server
// merges under the singleton lock and returns the full resolved settings.
export type UpdateWorkspaceSettings = Partial<Omit<WorkspaceSettings, 'coverage_thresholds'>> & {
  coverage_thresholds?: Partial<CoverageThresholds>;
};

export const workspaceSettingsQueryKey = ['workspace-settings'] as const;

async function fetchWorkspaceSettings(signal?: AbortSignal): Promise<WorkspaceSettings> {
  const response = await apiClient<WorkspaceSettings>('GET', '/workspace/settings', {
    ...(signal !== undefined ? { signal } : {}),
  });
  return response.data;
}

async function patchWorkspaceSettings(body: UpdateWorkspaceSettings): Promise<WorkspaceSettings> {
  const response = await apiClient<WorkspaceSettings>('PATCH', '/workspace/settings', { body });
  return response.data;
}

export function useWorkspaceSettings() {
  return useQuery({
    queryKey: workspaceSettingsQueryKey,
    queryFn: ({ signal }) => fetchWorkspaceSettings(signal),
    retry: false,
  });
}

export function useUpdateWorkspaceSettings() {
  const queryClient = useQueryClient();
  return useMutation<WorkspaceSettings, ApiError, UpdateWorkspaceSettings>({
    mutationFn: patchWorkspaceSettings,
    onSuccess: (settings) => {
      queryClient.setQueryData(workspaceSettingsQueryKey, settings);
      // ADR-0067 56-C: bands apply to every scope at once, so saving
      // invalidates the whole dashboard-summary family, not just one scope.
      void queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });
}
