import { mapUnknownError } from '@/lib/api';
import { updateMilestone } from '@/lib/api/milestones';
import { ApiError } from '@/lib/api/types';
import type { MilestoneDetailDto, MilestoneDto } from '@fops/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

export function useMilestoneTitleEdit(
  milestone: MilestoneDetailDto,
  onTitleDirtyChange: (dirty: boolean) => void,
) {
  const queryClient = useQueryClient();
  const [editingTitle, setEditingTitle] = React.useState(false);
  const [titleDraft, setTitleDraft] = React.useState('');
  const [titleEditVersion, setTitleEditVersion] = React.useState<string | null>(null);
  const [titleError, setTitleError] = React.useState<string | null>(null);
  const titleDirty = editingTitle && titleDraft !== milestone.title;

  React.useEffect(() => {
    onTitleDirtyChange(titleDirty);
    return () => onTitleDirtyChange(false);
  }, [titleDirty, onTitleDirtyChange]);

  const discardTitleEdit = React.useCallback(() => {
    setEditingTitle(false);
    setTitleDraft('');
    setTitleEditVersion(null);
    setTitleError(null);
  }, []);

  const titleMutation = useMutation<MilestoneDto, Error, { ifMatch: string }>({
    mutationFn: async ({ ifMatch }) =>
      updateMilestone(
        milestone.id,
        { title: titleDraft.trim() },
        { ifMatch, idempotencyKey: crypto.randomUUID() },
      ),
    onSuccess: async () => {
      setEditingTitle(false);
      setTitleEditVersion(null);
      setTitleError(null);
      await queryClient.invalidateQueries({ queryKey: ['milestone', milestone.id] });
      await queryClient.invalidateQueries({ queryKey: ['milestones'] });
    },
    onError: async (err) => {
      if (err instanceof ApiError && err.status === 409 && err.code === 'conflict.stale_write') {
        discardTitleEdit();
        await queryClient.refetchQueries({ queryKey: ['milestone', milestone.id], exact: true });
      } else {
        setTitleError(mapUnknownError(err).message);
      }
    },
  });

  function startTitleEdit(statusMutationPending: boolean): void {
    if (titleMutation.isPending || statusMutationPending) return;
    setTitleDraft(milestone.title);
    setTitleEditVersion(milestone.updated_at);
    setTitleError(null);
    setEditingTitle(true);
  }

  function cancelTitleEdit(): void {
    setEditingTitle(false);
    setTitleEditVersion(null);
    setTitleError(null);
  }

  function submitTitleEdit(
    event: React.FormEvent<HTMLFormElement>,
    statusMutationPending: boolean,
  ): void {
    event.preventDefault();
    if (titleMutation.isPending || statusMutationPending) return;
    if (titleDraft.trim() === '') {
      setTitleError('Title is required.');
      return;
    }
    if (titleEditVersion === null) return;
    titleMutation.mutate({ ifMatch: titleEditVersion });
  }

  return {
    editingTitle,
    titleDraft,
    setTitleDraft,
    titleEditVersion,
    setTitleEditVersion,
    titleError,
    setTitleError,
    titleDirty,
    titleMutation,
    startTitleEdit,
    cancelTitleEdit,
    discardTitleEdit,
    submitTitleEdit,
  };
}
