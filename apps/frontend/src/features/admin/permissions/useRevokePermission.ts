import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { errorMapper } from '@/lib/api/errorMapper';
import { revokePermission } from '@/lib/api/permissions';
import type { ApiError } from '@/lib/api/types';
import { ADMIN_PERMISSIONS_COPY } from '@/lib/copy/admin-permissions';
import type { RevokePermissionResult } from '@fops/shared';

export const permissionGrantsListKey = ['permission-grants', 'admin'] as const;
export const permissionDeniesListKey = ['permission-denies', 'admin'] as const;

export interface RevokePermissionArgs {
  kind: 'grants' | 'denies';
  id: string;
  reason: string;
  idempotencyKey: string;
}

export function useRevokePermission(): UseMutationResult<
  RevokePermissionResult,
  ApiError,
  RevokePermissionArgs
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ kind, id, reason, idempotencyKey }: RevokePermissionArgs) =>
      revokePermission(kind, id, reason, idempotencyKey),
    onSuccess: async (_result, args) => {
      toast.success(
        args.kind === 'grants'
          ? ADMIN_PERMISSIONS_COPY.revokeSuccess
          : ADMIN_PERMISSIONS_COPY.liftSuccess,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: permissionGrantsListKey }),
        queryClient.invalidateQueries({ queryKey: permissionDeniesListKey }),
      ]);
    },
    onError: async (error: ApiError) => {
      toast.error(errorMapper(error.envelope).message);
      if (error.code === 'conflict.permission_not_active' || error.code === 'not_found.record') {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: permissionGrantsListKey }),
          queryClient.invalidateQueries({ queryKey: permissionDeniesListKey }),
        ]);
      }
    },
  });
}
