import {
  approveTaskRequest,
  fetchPermissionCheck,
  rejectTaskRequest,
  requestMoreEvidenceForTaskRequest,
} from '@/lib/api';
import type { ApiError } from '@/lib/api/types';
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
      void queryClient.invalidateQueries({ queryKey: ['task-requests'] });
      toast('Task Request updated.');
    },
    onError: (err) => {
      decisionSubmittingRef.current = false;
      setIsDecisionSubmitting(false);
      setDecisionDialog((current) => {
        if (current) return { ...current, error: err.envelope.message };
        toast.error(err.envelope.message);
        return current;
      });
    },
  });

  function approve(): void {
    if (isSelfApproval && !canSelfApprove) {
      toast.error('Self-approval requires scoped capability.');
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
        ? 'Self-approval requires a reason.'
        : decisionDialog.action === 'request-more-evidence' && value.length === 0
          ? 'Note is required.'
          : decisionDialog.action === 'reject' && value.length === 0
            ? 'Reason is required.'
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
