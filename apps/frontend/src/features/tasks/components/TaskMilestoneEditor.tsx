import { mapUnknownError } from '@/lib/api/errorMapper';
import { listMilestones } from '@/lib/api/milestones';
import { ApiError, isPermissionDenied } from '@/lib/api/types';
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

// The whole request identity of one submission. The backend folds If-Match
// into the idempotency hash, so a retry may only resend all three unchanged.
interface MilestoneAttempt {
  key: string;
  ifMatch: string;
  milestoneId: string | null;
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
 * ResponsibilityEditor: trigger → select → 저장/취소, one captured request
 * identity (idempotency key + If-Match + choice) per draft — an
 * ambiguous-failure retry resends it unchanged so the server replays, while a
 * 409 stale write or a choice change starts a new attempt — focus to the
 * select on open and back to the trigger on close. Choices are the Task's
 * Managed System Milestones in every status (ADR-0050 D5: assignment does not
 * consult status) plus `Milestone 없음`, which sends `null`. A settled
 * choices read error hides retained options (same terminal-error contract as
 * the Task Request conversion picker).
 */
export function TaskMilestoneEditor({
  taskId,
  managedSystemId,
  milestoneId,
  ifMatch,
  valueLabel,
  canEdit,
  onSave,
}: {
  taskId: string;
  managedSystemId: string;
  milestoneId: string | null;
  /** Task concurrency token (`updated_at`) for the next first submission. */
  ifMatch: string;
  /** Current `display_id title`, or null while unassigned / loading. */
  valueLabel: string | null;
  canEdit: boolean;
  onSave: (milestoneId: string | null, idempotencyKey: string, ifMatch: string) => Promise<unknown>;
}) {
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(NO_MILESTONE);
  const [focusReturnPending, setFocusReturnPending] = useState(false);
  // Set at the first submission of a draft; kept for ambiguous-failure
  // retries, cleared by stale-write 409, choice change, and success.
  const submission = useRef<MilestoneAttempt | null>(null);
  const editTriggerRef = useRef<HTMLButtonElement | null>(null);
  const selectRef = useRef<HTMLButtonElement | null>(null);
  // The stale-write refetch flows a new updated_at through the ifMatch prop;
  // only then may the current-value line render (never the pre-conflict
  // value).
  const [conflictRefreshed, setConflictRefreshed] = useState(false);
  const lastIfMatchRef = useRef(ifMatch);

  // Same cache segment as the Milestones route (['milestones', …]) so
  // ['milestones'] invalidations reach it; loads only while open.
  const choices = useQuery({
    queryKey: ['milestones', 'task-options', managedSystemId] as const,
    queryFn: ({ signal }) => listMilestones({ managed_system_id: managedSystemId, signal }),
    enabled: editing,
    staleTime: 30 * 1000,
  });
  useEffect(() => {
    if (lastIfMatchRef.current !== ifMatch) {
      lastIfMatchRef.current = ifMatch;
      setConflictRefreshed(true);
    }
  }, [ifMatch]);

  // R2 (same terminal-error contract as the Task Request conversion picker): a
  // settled choices read error wins over the data React Query retains — no
  // retained titles as options, a held pick is blocked, the explicit clear
  // stays available.
  const choicesError = choices.error;
  const choicesDenied = choicesError !== null && isPermissionDenied(choicesError);
  const choiceItems = choicesError === null ? (choices.data?.items ?? []) : [];
  const heldChoiceUnavailable = choicesError !== null && value !== NO_MILESTONE;

  const isStaleWrite = (error: unknown) =>
    error instanceof ApiError && error.status === 409 && error.code === 'conflict.stale_write';

  const save = useMutation<unknown, Error, AssignMilestoneVars>({
    mutationFn: (vars) => {
      submission.current ??= { key: crypto.randomUUID(), ifMatch, milestoneId: vars.to };
      const attempt = submission.current;
      return onSave(attempt.milestoneId, attempt.key, attempt.ifMatch);
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
      submission.current = null;
    },
    onError: (error) => {
      if (isStaleWrite(error)) {
        // Same stale-write reconciliation as useMilestoneStatusEdit: refetch
        // the moved-under-us Task; the editor stays open with the user's
        // choice. The 409 was rejected before any idempotency record, so the
        // next save is a new attempt: new key and the refreshed If-Match that
        // arrives through the refetched prop.
        submission.current = null;
        void client.refetchQueries({ queryKey: ['task', taskId], exact: true });
      }
      // Ambiguous failures (network error / 5xx / lost response) keep the
      // captured identity so the retry replays the stored response instead of
      // tripping conflict.idempotency_key_reuse.
    },
  });
  const changeDraft = (next: string) => {
    setValue(next);
    submission.current = null;
    save.reset();
    setConflictRefreshed(false);
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
            aria-label={TASK_MILESTONE_COPY.editAriaLabel}
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
        // A held pick whose read has failed terminally cannot ride; only an
        // explicit none is allowed through.
        if (choicesError !== null && value !== NO_MILESTONE) return;
        save.mutate({ from: milestoneId, to: value === NO_MILESTONE ? null : value });
      }}
    >
      <Select value={value} disabled={save.isPending} onValueChange={(next) => changeDraft(next)}>
        <SelectTrigger ref={selectRef} aria-label={TASK_MILESTONE_COPY.select}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_MILESTONE}>{TASK_MILESTONE_COPY.none}</SelectItem>
          {choiceItems.map((choice) => (
            <SelectItem key={choice.id} value={choice.id}>
              {choice.display_id} {choice.title} ({milestoneStatusLabel(choice.status)})
            </SelectItem>
          ))}
          {/* R2 + R4: keep the unavailable held value identity-free and allow
              None. */}
          {heldChoiceUnavailable && (
            <SelectItem value={value} disabled>
              {TASK_MILESTONE_COPY.choiceUnavailable}
            </SelectItem>
          )}
        </SelectContent>
      </Select>
      {choicesError !== null && (
        <span className={choicesDenied ? 'text-xs text-accent-danger' : 'text-xs text-text-muted'}>
          {choicesDenied
            ? mapUnknownError(choicesError).message
            : TASK_MILESTONE_COPY.choicesUnavailable}
        </span>
      )}
      {save.isError && (
        <span role="alert" className="text-xs text-accent-danger">
          {mapUnknownError(save.error).message}
        </span>
      )}
      {save.isError &&
        isStaleWrite(save.error) &&
        conflictRefreshed &&
        (milestoneId === null || valueLabel !== null) && (
          <span className="text-xs text-text-muted">
            {TASK_MILESTONE_COPY.current(milestoneId === null ? null : valueLabel)}
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
