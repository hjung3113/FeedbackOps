import { resolveActors } from '@/lib/api';
import { mapUnknownError } from '@/lib/api/errorMapper';
import { GLOSSARY } from '@/lib/copy/glossary';
import { RESPONSIBILITY_COPY } from '@/lib/copy/tasks';
import { shortId } from '@/lib/identity';
import {
  Button,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  UnassignedBadge,
} from '@fops/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';

export function ResponsibilityEditor({
  actorId,
  teamId,
  canEdit,
  onSave,
  label,
}: {
  actorId: string | null;
  teamId: string | null;
  canEdit: boolean;
  label: string;
  onSave: (actorId: string | null, teamId: string | null, key: string) => Promise<unknown>;
}) {
  const client = useQueryClient();
  const inputId = useId();
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<'unassigned' | 'actor' | 'team'>('unassigned');
  const [value, setValue] = useState('');
  const submissionKey = useRef<string | null>(null);
  const identity = useQuery({
    queryKey: ['actors-resolve', actorId, teamId],
    enabled: actorId !== null || teamId !== null,
    queryFn: ({ signal }) =>
      resolveActors(
        { actorIds: actorId ? [actorId] : [], teamIds: teamId ? [teamId] : [] },
        signal,
      ),
    staleTime: 60_000,
  });
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
      setEditing(false);
      submissionKey.current = null;
    },
  });
  const changeDraft = (next: string) => {
    setValue(next);
    submissionKey.current = null;
    save.reset();
  };
  if (!editing)
    return (
      <div className="flex flex-col gap-1">
        {actorId ? (
          <span>
            {identity.data?.actors.find((actor) => actor.id === actorId)?.display_name ??
              GLOSSARY.unknownUser}
          </span>
        ) : teamId ? (
          <span>
            {identity.data?.teams.find((team) => team.id === teamId)?.name ??
              `팀 ${shortId(teamId)}`}
          </span>
        ) : (
          <UnassignedBadge
            label={label === RESPONSIBILITY_COPY.reviewer ? '미배정' : '담당자 없음'}
          />
        )}
        {canEdit && (
          <Button
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
      </div>
    );
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!save.isPending && (mode === 'unassigned' || value.trim())) save.mutate();
      }}
    >
      <Select
        value={mode}
        disabled={save.isPending}
        onValueChange={(next) => {
          setMode(next as typeof mode);
          changeDraft('');
        }}
      >
        <SelectTrigger aria-label={RESPONSIBILITY_COPY.mode}>
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
      {mode !== 'unassigned' && (
        <>
          <FieldLabel htmlFor={inputId}>
            {mode === 'actor' ? RESPONSIBILITY_COPY.actorId : RESPONSIBILITY_COPY.teamId}
          </FieldLabel>
          <input
            id={inputId}
            className="rounded border border-border-subtle bg-surface-detail px-2 py-1 text-sm"
            value={value}
            disabled={save.isPending}
            onChange={(event) => changeDraft(event.target.value)}
          />
        </>
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={save.isPending}
          onClick={() => setEditing(false)}
        >
          취소
        </Button>
      </div>
    </form>
  );
}
