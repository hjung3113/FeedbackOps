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
  // B2e — title-only edit. Managed System is a create-only field (A3/A8) and
  // never becomes an input here; the PATCH carries the title and If-Match
  // with a fresh idempotency key, nothing else. The If-Match is the row's
  // updated_at captured when editing starts (Astra finding 2): a background
  // refetch that delivers a newer version must not rebase the unsaved draft
  // onto it, or Save would silently overwrite the concurrent change instead
  // of losing the race as a 409 conflict.stale_write.
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
        // Stale If-Match: the server row wins. Drop the typed title, refetch,
        // and show the stored title — never layer the draft over it.
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
    // Astra finding 2 — the concurrency token is bound at edit start; a
    // refetch while editing never moves it (see the titleEditVersion comment).
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
    // R3 — serialized with the status mutation: a same-version title request
    // sent while a status change is in flight would be 409-cleared the
    // moment the status write commits. The disabled Save button and this
    // guard (Enter submits the form too) both refuse the race.
    if (titleMutation.isPending || statusMutationPending) return;
    if (titleDraft.trim() === '') {
      setTitleError('제목을 입력해 주세요.');
      return;
    }
    // Unreachable in practice — the editor only opens via startTitleEdit,
    // which pins the version — but the stale-write contract must never
    // silently fall back to the latest refetched token.
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

export type UseMilestoneTitleEditResult = ReturnType<typeof useMilestoneTitleEdit>;
