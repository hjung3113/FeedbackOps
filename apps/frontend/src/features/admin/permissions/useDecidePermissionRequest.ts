import type { ApprovePermissionRequest, PermissionDecisionResult } from "@fops/shared";
import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { toast } from "sonner";

import {
  decidePermissionRequest,
  type PermissionRequestDecisionAction,
  type ApiError,
  errorMapper,
} from "@/lib/api";

export const permissionRequestsReviewKey = [
  "permission-requests",
  "review",
] as const;

export interface DecidePermissionRequestArgs {
  id: string;
  action: PermissionRequestDecisionAction;
  reason: string;
  idempotencyKey: string;
  selfApproval?: ApprovePermissionRequest["self_approval"];
}

export function useDecidePermissionRequest(): UseMutationResult<
  PermissionDecisionResult,
  ApiError,
  DecidePermissionRequestArgs
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      action,
      reason,
      idempotencyKey,
      selfApproval,
    }: DecidePermissionRequestArgs) =>
      decidePermissionRequest(id, action, reason, idempotencyKey, selfApproval),
    onSuccess: async () => {
      toast.success("권한 요청이 처리되었습니다.");
      await queryClient.invalidateQueries({
        queryKey: permissionRequestsReviewKey,
      });
    },
    onError: async (error: ApiError) => {
      if (error.code === "conflict.stale_write") {
        toast.error("이미 처리된 요청입니다.");
        await queryClient.invalidateQueries({
          queryKey: permissionRequestsReviewKey,
        });
        return;
      }
      toast.error(errorMapper(error.envelope).message);
    },
  });
}
