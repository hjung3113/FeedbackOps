import { TaskRequestDraftCard } from '@/features/cross-system/request-task/TaskRequestDraftCard';
import { type ApiError, errorMapper, useIdempotencyKey } from '@/lib/api';
import { TASK_REQUEST_COPY } from '@/lib/copy/task-requests';
import type { FindingDto } from '@fops/shared';
import { useNavigate } from '@tanstack/react-router';
import type * as React from 'react';
import { toast } from 'sonner';
import { useRequestTaskFromFinding } from '../../hooks/useRequestTaskFromFinding';

export interface FindingRequestTaskDraftHostProps {
  findingId: string;
  finding: FindingDto | undefined;
  open: boolean;
  onClose: () => void;
}

function FindingRequestTaskDraftSubmission({
  finding,
  idempotencyKey,
  markConsumed,
  onClose,
}: {
  finding: FindingDto;
  idempotencyKey: string;
  markConsumed: () => void;
  onClose: () => void;
}): React.ReactElement {
  const navigate = useNavigate();
  const mutation = useRequestTaskFromFinding({
    findingId: finding.id,
    idempotencyKey,
    onError: (err: ApiError) => {
      toast.error(errorMapper(err.envelope).message);
    },
  });

  return (
    <TaskRequestDraftCard
      sourceKind="Finding"
      sourceDisplayId={finding.display_id}
      evidenceSummaryDefault={finding.summary}
      isSubmitting={mutation.isPending}
      source={{ type: 'finding', id: finding.id }}
      onClose={onClose}
      onSubmit={(values) => {
        mutation.mutate(values, {
          onSuccess: (request) => {
            markConsumed();
            mutation.reset();
            onClose();
            toast.success(TASK_REQUEST_COPY.created, {
              duration: Number.POSITIVE_INFINITY,
              action: {
                label: TASK_REQUEST_COPY.openRequest,
                onClick: () => {
                  void navigate({ to: '/tasks', search: { view: 'requests', param: request.id } });
                },
              },
            });
          },
        });
      }}
    />
  );
}

export function FindingRequestTaskDraftHost({
  findingId,
  finding,
  open,
  onClose,
}: FindingRequestTaskDraftHostProps): React.ReactElement | null {
  const { key, markConsumed } = useIdempotencyKey();

  if (!open || !finding || finding.id !== findingId) return null;

  return (
    <FindingRequestTaskDraftSubmission
      finding={finding}
      idempotencyKey={key}
      markConsumed={markConsumed}
      onClose={onClose}
    />
  );
}
