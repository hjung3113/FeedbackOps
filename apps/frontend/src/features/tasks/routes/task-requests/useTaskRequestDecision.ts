import {
  approveTaskRequest,
  fetchPermissionCheck,
  rejectTaskRequest,
  requestMoreEvidenceForTaskRequest,
} from '@/lib/api';
import { mapUnknownError } from '@/lib/api/errorMapper';
import type { ApiError } from '@/lib/api/types';
import { invalidateNavCounts } from '@/lib/query/navCounts';
import type { TaskRequestDto } from '@fops/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { toast } from 'sonner';

import type { DecisionDialogState } from './TaskRequestDecisionDialog';
import {
  canApproveTaskRequest,
  canRejectTaskRequest,
  canRequestEvidenceForTaskRequest,
} from './predicates';

export interface UseTaskRequestDecisionArgs {
  item: TaskRequestDto;
  currentActorId: string | null;
  currentRole: string | null;
}

export interface UseTaskRequestDecisionResult {
  dialog: DecisionDialogState | null;
  isSubmitting: boolean;
  isPending: boolean;
  /** Last decision mutation's settled result, independent of dialog/toast state. */
  result: TaskRequestDto | null;
  /** Last decision mutation's settled error, independent of dialog/toast state. */
  error: ApiError | null;
  isSelfApproval: boolean;
  canApprove: boolean;
  canReject: boolean;
  canRequestEvidence: boolean;
  canSelfApprove: boolean;
  approve: () => void;
  requestEvidence: () => void;
  reject: () => void;
  submitDecision: (event: React.FormEvent<HTMLFormElement>) => void;
  changeValue: (value: string) => void;
  close: () => void;
}

export function useTaskRequestDecision({
  item,
  currentActorId,
  currentRole,
}: UseTaskRequestDecisionArgs): UseTaskRequestDecisionResult {
  const queryClient = useQueryClient();
  const isSelfApproval = currentActorId === item.requester_actor_id;
  const [decisionDialog, setDecisionDialog] = React.useState<DecisionDialogState | null>(null);
  const [isDecisionSubmitting, setIsDecisionSubmitting] = React.useState(false);
  const decisionSubmittingRef = React.useRef(false);
  const lastItemRef = React.useRef(item);

  React.useEffect(() => {
    if (lastItemRef.current === item) return;
    lastItemRef.current = item;
    setDecisionDialog(null);
    setIsDecisionSubmitting(false);
    decisionSubmittingRef.current = false;
  });

  const selfApprovalCheck = useQuery({
    queryKey: ['permission-check', 'task_request.self_approve', item.primary_managed_system_id],
    queryFn: ({ signal }) =>
      fetchPermissionCheck('task_request.self_approve', {
        managedSystemId: item.primary_managed_system_id,
        signal,
      }),
    enabled: isSelfApproval && currentRole !== 'admin',
    staleTime: 60 * 1000,
  });
  const canSelfApprove = currentRole === 'admin' || selfApprovalCheck.data?.state === 'approved';
  const canApprove = canApproveTaskRequest(item.status);
  const canReject = canRejectTaskRequest(item.status);
  const canRequestEvidence = canRequestEvidenceForTaskRequest(item.status);

  const decisionMutation = useMutation<
    TaskRequestDto,
    ApiError,
    { action: string; reason?: string; note?: string }
  >({
    mutationFn: async (vars) => {
      const key = crypto.randomUUID();
      if (vars.action === 'approve') {
        return approveTaskRequest(item.id, vars.reason ? { reason: vars.reason } : {}, key);
      }
      if (vars.action === 'reject') {
        return rejectTaskRequest(item.id, { reason: vars.reason ?? '' }, key);
      }
      return requestMoreEvidenceForTaskRequest(item.id, { note: vars.note ?? '' }, key);
    },
    onSuccess: () => {
      decisionSubmittingRef.current = false;
      setIsDecisionSubmitting(false);
      setDecisionDialog(null);
      invalidateNavCounts(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['task-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['task-request'] });
      toast.success('Task Request가 처리되었습니다.');
    },
    onError: (err) => {
      decisionSubmittingRef.current = false;
      setIsDecisionSubmitting(false);
      // #561: computed outside the updater; React runs updaters during render, so a throw
      // there (a non-ApiError has no envelope) would take down the whole screen.
      const message = mapUnknownError(err).message;
      setDecisionDialog((current) => {
        if (current) return { ...current, error: message };
        toast.error(message);
        return current;
      });
    },
  });

  function approve(): void {
    if (isSelfApproval && !canSelfApprove) {
      toast.error('본인 승인에는 범위가 지정된 권한이 필요합니다.');
      return;
    }
    setDecisionDialog({ action: 'approve', value: '', error: null });
  }

  function requestEvidence(): void {
    setDecisionDialog({ action: 'request-more-evidence', value: '', error: null });
  }

  function reject(): void {
    setDecisionDialog({ action: 'reject', value: '', error: null });
  }

  function submitDecision(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!decisionDialog || decisionSubmittingRef.current) return;
    const value = decisionDialog.value.trim();
    const error =
      decisionDialog.action === 'approve' && isSelfApproval && value.length === 0
        ? '본인 승인 사유를 입력해 주세요.'
        : decisionDialog.action === 'request-more-evidence' && value.length === 0
          ? '근거 메모를 입력해 주세요.'
          : decisionDialog.action === 'reject' && value.length === 0
            ? '반려 사유를 입력해 주세요.'
            : null;
    if (error) {
      setDecisionDialog((current) => (current ? { ...current, error } : current));
      return;
    }
    decisionSubmittingRef.current = true;
    setIsDecisionSubmitting(true);
    if (decisionDialog.action === 'approve') {
      decisionMutation.mutate(value ? { action: 'approve', reason: value } : { action: 'approve' });
      return;
    }
    decisionMutation.mutate(
      decisionDialog.action === 'reject'
        ? { action: 'reject', reason: value }
        : { action: 'request-more-evidence', note: value },
    );
  }

  function changeValue(value: string): void {
    setDecisionDialog((current) => (current ? { ...current, value, error: null } : current));
  }

  function close(): void {
    if (!decisionSubmittingRef.current) setDecisionDialog(null);
  }

  return {
    dialog: decisionDialog,
    isSubmitting: isDecisionSubmitting,
    isPending: decisionMutation.isPending,
    result: decisionMutation.data ?? null,
    error: decisionMutation.error ?? null,
    isSelfApproval,
    canApprove,
    canReject,
    canRequestEvidence,
    canSelfApprove,
    approve,
    requestEvidence,
    reject,
    submitDecision,
    changeValue,
    close,
  };
}
