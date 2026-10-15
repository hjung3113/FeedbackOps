import { mapUnknownError } from '@/lib/api/errorMapper';
import { listMilestones } from '@/lib/api/milestones';
import { ApiError } from '@/lib/api/types';
import { TASK_MILESTONE_COPY } from '@/lib/copy/tasks';
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@fops/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { MILESTONE_STATUS_LABELS } from './MilestoneStatusBadge';

const NO_MILESTONE = '__none__';

interface AssignMilestoneVars {
  from: string | null;
  to: string | null;
}

// ADR-0050 closed the persisted set; the DTO still carries stored text, so
// unknown values fall back to the badge's defensive default.
function milestoneStatusLabel(status: string): string {
  return Object.hasOwn(MILESTONE_STATUS_LABELS, status)
    ? MILESTONE_STATUS_LABELS[status as keyof typeof MILESTONE_STATUS_LABELS]
    : MILESTONE_STATUS_LABELS.planning;
}

/**
 * #1181 — inline Milestone assign/move/clear for the Task detail row, mirroring
 * ResponsibilityEditor: trigger → select → 저장/취소, one idempotency key per
 * draft (kept across a conflict retry), focus to the select on open and back
 * to the trigger on close. Choices are the Task's Managed System Milestones in
 * every status (ADR-0050 D5: assignment does not consult status) plus
 * `Milestone 없음`, which sends `null`.
 */
export function TaskMilestoneEditor({
  taskId,
  managedSystemId,
  milestoneId,
  valueLabel,
  canEdit,
  onSave,
}: {
  taskId: string;
  managedSystemId: string;
  milestoneId: string | null;
  /** Current `display_id title`, or null while unassigned / loading. */
  valueLabel: string | null;
  canEdit: boolean;
  onSave: (milestoneId: string | null, idempotencyKey: string) => Promise<unknown>;
}) {
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(NO_MILESTONE);
  const [focusReturnPending, setFocusReturnPending] = useState(false);
  const submissionKey = useRef<string | null>(null);
  const editTriggerRef = useRef<HTMLButtonElement | null>(null);
  const selectRef = useRef<HTMLButtonElement | null>(null);

  // Same cache segment as the Milestones route (['milestones', …]) so
  // ['milestones'] invalidations reach it; loads only while open.
  const choices = useQuery({
    queryKey: ['milestones', 'task-options', managedSystemId] as const,
    queryFn: ({ signal }) => listMilestones({ managed_system_id: managedSystemId, signal }),
    enabled: editing,
    staleTime: 30 * 1000,
  });

  const save = useMutation<unknown, Error, AssignMilestoneVars>({
    mutationFn: (vars) => {
      submissionKey.current ??= crypto.randomUUID();
      return onSave(vars.to, submissionKey.current);
    },
    // from/to are captured at submission: the save invalidates the right
    // Milestones even when a Task switch unmounted this editor (key={task.id}).
    onSuccess: (_data, vars) => {
      const milestoneKeys: Array<readonly [string, string]> = [];
      if (vars.from !== null) milestoneKeys.push(['milestone', vars.from]);
      if (vars.to !== null) milestoneKeys.push(['milestone', vars.to]);
      for (const queryKey of [['task'], ['tasks'], ['milestones'], ...milestoneKeys]) {
        void client.invalidateQueries({ queryKey });
      }
      toast.success(TASK_MILESTONE_COPY.saved);
      setEditing(false);
      setFocusReturnPending(true);
      submissionKey.current = null;
    },
    onError: (error) => {
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.code === 'conflict.stale_write'
      ) {
        // Same stale-write reconciliation as useMilestoneStatusEdit: refetch
        // the moved-under-us Task; the editor stays open with the user's
        // choice and the submission key survives for the retry.
        void client.refetchQueries({ queryKey: ['task', taskId], exact: true });
      }
    },
  });
  const changeDraft = (next: string) => {
    setValue(next);
    submissionKey.current = null;
    save.reset();
  };
  const cancel = () => {
    if (save.isPending) return;
    setEditing(false);
    setFocusReturnPending(true);
  };
  // The trigger button is unmounted while the editor is open; focus it after it remounts.
  useEffect(() => {
    if (!editing && focusReturnPending) {
      editTriggerRef.current?.focus();
      setFocusReturnPending(false);
    }
  }, [editing, focusReturnPending]);
  useEffect(() => {
    if (editing) selectRef.current?.focus();
  }, [editing]);

  if (!editing)
    return (
      <span className="flex items-center gap-2">
        {valueLabel ? (
          <span className="text-sm text-text-primary">{valueLabel}</span>
        ) : (
          <span className="text-text-muted">—</span>
        )}
        {canEdit && (
          <Button
            ref={editTriggerRef}
            variant="ghost"
            size="sm"
            onClick={() => {
              changeDraft(milestoneId ?? NO_MILESTONE);
              setEditing(true);
            }}
          >
            {TASK_MILESTONE_COPY.edit}
          </Button>
        )}
      </span>
    );
  return (
    <form
      className="flex flex-col gap-2"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          cancel();
        }
      }}
      onSubmit={(event) => {
        event.preventDefault();
        if (save.isPending) return;
        save.mutate({ from: milestoneId, to: value === NO_MILESTONE ? null : value });
      }}
    >
      <Select value={value} disabled={save.isPending} onValueChange={(next) => changeDraft(next)}>
        <SelectTrigger ref={selectRef} aria-label={TASK_MILESTONE_COPY.select}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_MILESTONE}>{TASK_MILESTONE_COPY.none}</SelectItem>
          {(choices.data?.items ?? []).map((choice) => (
            <SelectItem key={choice.id} value={choice.id}>
              {choice.display_id} {choice.title} ({milestoneStatusLabel(choice.status)})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {save.isError && (
        <span role="alert" className="text-xs text-accent-danger">
          {mapUnknownError(save.error).message}
        </span>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={save.isPending} disabled={save.isPending}>
          {TASK_MILESTONE_COPY.save}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={save.isPending} onClick={cancel}>
          취소
        </Button>
      </div>
    </form>
  );
}
