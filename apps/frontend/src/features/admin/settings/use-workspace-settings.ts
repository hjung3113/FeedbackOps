import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { type ApiError, apiClient } from '../../../lib/api';

export type PermissionSelfApproval = 'allowed' | 'forbidden';

export interface WorkspaceSettings {
  permission_self_approval: PermissionSelfApproval;
  survey_anonymity_threshold: number;
}

export type UpdateWorkspaceSettings = Partial<WorkspaceSettings>;

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
    },
  });
}
