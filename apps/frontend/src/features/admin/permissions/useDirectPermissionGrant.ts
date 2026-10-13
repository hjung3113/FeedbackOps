import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { type ApiError, mapUnknownError } from '@/lib/api';
import { createDirectPermissionGrant } from '@/lib/api/permissions';
import { ADMIN_PERMISSIONS_COPY } from '@/lib/copy/admin-permissions';
import { permissionRequestsMineKey } from '@/lib/cross-system/usePermissionCheck';
import type { DirectPermissionGrant, PermissionGrantAdminItem } from '@fops/shared';

import { permissionRequestsReviewKey } from './useDecidePermissionRequest.js';
import { permissionDeniesListKey, permissionGrantsListKey } from './useRevokePermission.js';

export interface DirectPermissionGrantArgs {
  body: DirectPermissionGrant;
  idempotencyKey: string;
}

export function useDirectPermissionGrant(
  cacheReturnedGrant: (item: PermissionGrantAdminItem) => void,
): UseMutationResult<PermissionGrantAdminItem, ApiError, DirectPermissionGrantArgs> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ body, idempotencyKey }) => createDirectPermissionGrant(body, idempotencyKey),
    retry: false,
    onSuccess: (item) => {
      cacheReturnedGrant(item);
      toast.success(ADMIN_PERMISSIONS_COPY.directGrant.success);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: permissionGrantsListKey }),
        queryClient.invalidateQueries({ queryKey: permissionDeniesListKey }),
        queryClient.invalidateQueries({ queryKey: permissionRequestsMineKey }),
        queryClient.invalidateQueries({ queryKey: permissionRequestsReviewKey }),
        queryClient.invalidateQueries({ queryKey: ['permission-check'] }),
        queryClient.invalidateQueries({ queryKey: ['managed-system-scope'] }),
        queryClient.invalidateQueries({ queryKey: ['permission-grant-options'] }),
      ]);
    },
    onError: (error) => {
      toast.error(mapUnknownError(error).message);
    },
  });
}
