import { mapUnknownError } from '@/lib/api';
import { updateMilestone } from '@/lib/api/milestones';
import { ApiError } from '@/lib/api/types';
import type { MilestoneDetailDto, MilestoneDto, MilestoneStatusFilter } from '@fops/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

export function useMilestoneStatusEdit({
  milestone,
  titleEditVersion,
  setTitleEditVersion,
  discardTitleEdit,
}: {
  milestone: MilestoneDetailDto;
  titleEditVersion: string | null;
  setTitleEditVersion: React.Dispatch<React.SetStateAction<string | null>>;
  discardTitleEdit: () => void;
}) {
  const queryClient = useQueryClient();
  const [statusError, setStatusError] = React.useState<string | null>(null);
  const statusMutation = useMutation<
    MilestoneDto,
    Error,
    { status: MilestoneStatusFilter; ifMatch: string }
  >({
    mutationFn: async ({ status, ifMatch }) =>
      updateMilestone(milestone.id, { status }, { ifMatch, idempotencyKey: crypto.randomUUID() }),
    onSuccess: async (updated, { ifMatch: requestToken }) => {
      setStatusError(null);
      if (titleEditVersion !== null && titleEditVersion === requestToken) {
        setTitleEditVersion(updated.updated_at);
      }
      await queryClient.invalidateQueries({ queryKey: ['milestone', milestone.id] });
      await queryClient.invalidateQueries({ queryKey: ['milestones'] });
    },
    onError: async (err) => {
      if (err instanceof ApiError && err.status === 409 && err.code === 'conflict.stale_write') {
        setStatusError(null);
        discardTitleEdit();
        await queryClient.refetchQueries({ queryKey: ['milestone', milestone.id], exact: true });
      } else {
        setStatusError(mapUnknownError(err).message);
      }
    },
  });

  function handleStatusChange(
    event: React.ChangeEvent<HTMLSelectElement>,
    titleMutationPending: boolean,
  ): void {
    const status = event.target.value as MilestoneStatusFilter;
    if (status === milestone.status) return;
    if (statusMutation.isPending || titleMutationPending) return;
    setStatusError(null);
    statusMutation.mutate({ status, ifMatch: milestone.updated_at });
  }

  return { statusError, statusMutation, handleStatusChange };
}
