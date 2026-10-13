import { resolveActors } from '@/lib/api';
import { mapUnknownError } from '@/lib/api/errorMapper';
import { GLOSSARY } from '@/lib/copy/glossary';
import { RESPONSIBILITY_COPY } from '@/lib/copy/tasks';
import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import { shortId } from '@/lib/identity';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  UnassignedBadge,
} from '@fops/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

const NO_SELECTION = '__none__';

type Mode = 'unassigned' | 'actor' | 'team';

/** Names for the ids the pickers can select, resolved through /actors/resolve. */
export function useResponsibilityIdentityNames(actorId: string | null, teamIds: readonly string[]) {
  const query = useQuery({
    queryKey: ['actors-resolve', actorId ? [actorId] : [], [...teamIds].sort()] as const,
    enabled: actorId !== null || teamIds.length > 0,
    queryFn: ({ signal }) =>
      resolveActors({ actorIds: actorId ? [actorId] : [], teamIds: [...teamIds] }, signal),
    staleTime: 60_000,
  });
  return {
    actorName: (id: string) => query.data?.actors.find((actor) => actor.id === id)?.display_name,
    teamName: (id: string) => query.data?.teams.find((team) => team.id === id)?.name,
  };
}

/**
 * Eligible responsibility targets: authenticated internal people with an
 * elevated role. Scoped grant checks stay server-side (ADR-0067 56-F). One
 * source for the responsibility editor, the reviewer filter, and the Task
 * Request conversion form.
 */
export function useEligibleResponsibilityActors(enabled: boolean) {
  const actorOptions = useWorkspaceActors({ enabled });
  return (actorOptions.actors ?? []).filter(
    (actor) => actor.actor_type === 'internal_member' && actor.role_level !== 'user',
  );
}

export function ResponsibilityEditor({
  actorId,
  teamId,
  canEdit,
  label,
  teamCandidates,
  onSave,
}: {
  actorId: string | null;
  teamId: string | null;
  canEdit: boolean;
  label: string;
  /** Team ids already known in context (current value, Managed System defaults). */
  teamCandidates?: readonly string[];
  onSave: (actorId: string | null, teamId: string | null, key: string) => Promise<unknown>;
}) {
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<Mode>('unassigned');
  const [value, setValue] = useState('');
  const [focusReturnPending, setFocusReturnPending] = useState(false);
  const submissionKey = useRef<string | null>(null);
  const editTriggerRef = useRef<HTMLButtonElement | null>(null);
  const modeSelectRef = useRef<HTMLButtonElement | null>(null);
  const candidateTeamIds = [
    ...new Set([...(teamCandidates ?? []), teamId].filter((id): id is string => id != null)),
  ];
  const identity = useResponsibilityIdentityNames(actorId, candidateTeamIds);
  const eligibleActors = useEligibleResponsibilityActors(editing && canEdit);
  const save = useMutation({
    mutationFn: () => {
      submissionKey.current ??= crypto.randomUUID();
      return onSave(
        mode === 'actor' ? value.trim() : null,
        mode === 'team' ? value.trim() : null,
        submissionKey.current,
      );
    },
    onSuccess: () => {
      for (const queryKey of [
        ['tasks'],
        ['task'],
        ['task-requests'],
        ['task-request'],
        ['home-pending-task-requests'],
        ['home-my-tasks'],
      ]) {
        void client.invalidateQueries({ queryKey });
      }
      toast.success(RESPONSIBILITY_COPY.saved);
      setEditing(false);
      setFocusReturnPending(true);
      submissionKey.current = null;
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
    if (editing) modeSelectRef.current?.focus();
  }, [editing]);

  if (!editing)
    return (
      <span className="flex items-center gap-2">
        {actorId ? (
          <span>{identity.actorName(actorId) ?? GLOSSARY.unknownUser}</span>
        ) : teamId ? (
          <span>
            {RESPONSIBILITY_COPY.teamMark} · {identity.teamName(teamId) ?? `팀 ${shortId(teamId)}`}
          </span>
        ) : (
          <UnassignedBadge
            label={label === RESPONSIBILITY_COPY.reviewer ? '미배정' : '담당자 없음'}
          />
        )}
        {canEdit && (
          <Button
            ref={editTriggerRef}
            variant="ghost"
            size="sm"
            onClick={() => {
              setMode(actorId ? 'actor' : teamId ? 'team' : 'unassigned');
              changeDraft(actorId ?? teamId ?? '');
              setEditing(true);
            }}
          >
            {RESPONSIBILITY_COPY.edit}
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
        if (!save.isPending && (mode === 'unassigned' || value.trim())) save.mutate();
      }}
    >
      <Select
        value={mode}
        disabled={save.isPending}
        onValueChange={(next) => {
          setMode(next as Mode);
          changeDraft('');
        }}
      >
        <SelectTrigger ref={modeSelectRef} aria-label={RESPONSIBILITY_COPY.mode}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(['unassigned', 'actor', 'team'] as const).map((choice) => (
            <SelectItem key={choice} value={choice}>
              {RESPONSIBILITY_COPY.modes[choice]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {mode === 'actor' && (
        <Select
          value={value || NO_SELECTION}
          disabled={save.isPending}
          onValueChange={(next) => changeDraft(next === NO_SELECTION ? '' : next)}
        >
          <SelectTrigger aria-label={RESPONSIBILITY_COPY.actor}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_SELECTION}>{RESPONSIBILITY_COPY.selectActor}</SelectItem>
            {eligibleActors.map((actor) => (
              <SelectItem key={actor.id} value={actor.id}>
                {actor.display_name}
              </SelectItem>
            ))}
            {actorId && !eligibleActors.some((actor) => actor.id === actorId) && (
              <SelectItem value={actorId} disabled>
                {identity.actorName(actorId) ?? GLOSSARY.unknownUser} ·{' '}
                {RESPONSIBILITY_COPY.ineligible}
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      )}
      {mode === 'team' && candidateTeamIds.length === 0 && (
        <span className="text-xs text-text-muted">{RESPONSIBILITY_COPY.noTeams}</span>
      )}
      {mode === 'team' && candidateTeamIds.length > 0 && (
        <Select
          value={value || NO_SELECTION}
          disabled={save.isPending}
          onValueChange={(next) => changeDraft(next === NO_SELECTION ? '' : next)}
        >
          <SelectTrigger aria-label={RESPONSIBILITY_COPY.selectTeam}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_SELECTION}>{RESPONSIBILITY_COPY.selectTeam}</SelectItem>
            {candidateTeamIds.map((id) => (
              <SelectItem key={id} value={id}>
                {identity.teamName(id) ?? `팀 ${shortId(id)}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {save.isError && (
        <span role="alert" className="text-xs text-accent-danger">
          {mapUnknownError(save.error).message}
        </span>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          loading={save.isPending}
          disabled={save.isPending || (mode !== 'unassigned' && !value.trim())}
        >
          {RESPONSIBILITY_COPY.save}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={save.isPending} onClick={cancel}>
          취소
        </Button>
      </div>
    </form>
  );
}
