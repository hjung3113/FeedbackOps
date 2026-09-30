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
      // R2 — the draft token is advanced ONLY when the status PATCH started
      // from the same version the open draft was composed against: the two
      // writes were coordinated, so the next title save succeeds instead of
      // 409-discarding the user's own work. A PATCH sent from an externally
      // newer version does not match, so the older draft keeps its own token
      // and cannot rebase over the external change.
      if (titleEditVersion !== null && titleEditVersion === requestToken) {
        setTitleEditVersion(updated.updated_at);
      }
      await queryClient.invalidateQueries({ queryKey: ['milestone', milestone.id] });
      await queryClient.invalidateQueries({ queryKey: ['milestones'] });
    },
    onError: async (err) => {
      if (err instanceof ApiError && err.status === 409 && err.code === 'conflict.stale_write') {
        setStatusError(null);
        // B2e-status fixup (midreview P2) — the refetched row carries a new
        // concurrency token, so an open title draft composed against the old
        // row must not silently rebase onto it (the server could no longer
        // reject the stale draft). Same reconciliation as the title-409
        // branch: discard the editor, draft, and captured version before the
        // refetch. A generic failure keeps the editor and draft untouched.
        discardTitleEdit();
        await queryClient.refetchQueries({ queryKey: ['milestone', milestone.id], exact: true });
      } else {
        setStatusError(mapUnknownError(err).message);
      }
    },
  });

  function handleStatusChange(value: string, titleMutationPending: boolean): void {
    const status = value as MilestoneStatusFilter;
    if (status === milestone.status) return;
    // R3 — serialized with the title mutation: a status change issued while
    // a title save is in flight would commit from the same version and
    // 409-clear the just-submitted draft. The disabled select and this guard
    // both refuse the race.
    if (statusMutation.isPending || titleMutationPending) return;
    setStatusError(null);
    // R2 — the token is captured here so onSuccess can compare it with the
    // open draft's captured version (same-version-only coordination).
    statusMutation.mutate({ status, ifMatch: milestone.updated_at });
  }

  return { statusError, statusMutation, handleStatusChange };
}
