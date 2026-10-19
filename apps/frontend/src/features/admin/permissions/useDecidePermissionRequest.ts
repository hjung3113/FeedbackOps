import { permissionRequestsMineKey } from '@/lib/cross-system/usePermissionCheck';
import { invalidateRecovery } from '@/lib/query/recovery';
import type { ApprovePermissionRequest, PermissionDecisionResult } from "@fops/shared";
import {
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import {
  type ApiError,
  type PermissionRequestDecisionAction,
  decidePermissionRequest,
  mapUnknownError,
  permissionRequestAdminDetailKey,
  permissionRequestOwnerDetailKey,
} from "@/lib/api";

export const permissionRequestsReviewKey = [
  "permission-requests",
  "review",
] as const;

export interface DecidePermissionRequestArgs {
  id: string;
  expectedRevision: number;
  action: PermissionRequestDecisionAction;
  reason: string;
  idempotencyKey: string;
  selfApproval?: ApprovePermissionRequest["self_approval"];
  grantedManagedSystemId?: ApprovePermissionRequest["granted_managed_system_id"];
  expiration?: ApprovePermissionRequest["expiration"];
}

export function useDecidePermissionRequest(
  onSettled?: (succeeded: boolean) => void,
  onStale?: () => void,
  onSucceeded?: (result: PermissionDecisionResult) => void,
): UseMutationResult<PermissionDecisionResult, ApiError, DecidePermissionRequestArgs> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      expectedRevision,
      action,
      reason,
      idempotencyKey,
      selfApproval,
      expiration,
      grantedManagedSystemId,
    }: DecidePermissionRequestArgs) =>
      decidePermissionRequest(
        id,
        action,
        reason,
        idempotencyKey,
        expectedRevision,
        selfApproval,
        expiration,
        grantedManagedSystemId,
      ),
    retry: false,
    onSettled: (data) => onSettled?.(data !== undefined),
    onSuccess: async (data, args) => {
      onSucceeded?.(data);
      toast.success('권한 요청이 처리되었습니다.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: permissionRequestsReviewKey }),
        queryClient.invalidateQueries({ queryKey: permissionRequestAdminDetailKey(args.id) }),
        queryClient.invalidateQueries({ queryKey: permissionRequestOwnerDetailKey(args.id) }),
        queryClient.invalidateQueries({ queryKey: permissionRequestsMineKey }),
        queryClient.invalidateQueries({ queryKey: ['permission-check'] }),
        invalidateRecovery(queryClient),
        queryClient.invalidateQueries({ queryKey: ['managed-system-scope'] }),
      ]);
    },
    onError: async (error: ApiError, args) => {
      toast.error(mapUnknownError(error).message);
      if (error.code === 'conflict.stale_write') {
        onStale?.();
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: permissionRequestsReviewKey }),
          queryClient.invalidateQueries({ queryKey: permissionRequestAdminDetailKey(args.id) }),
          queryClient.invalidateQueries({ queryKey: permissionRequestOwnerDetailKey(args.id) }),
          queryClient.invalidateQueries({ queryKey: permissionRequestsMineKey }),
          queryClient.invalidateQueries({ queryKey: ['permission-check'] }),
          queryClient.invalidateQueries({ queryKey: ['managed-system-scope'] }),
          invalidateRecovery(queryClient),
        ]);
      }
    },
  });
}
