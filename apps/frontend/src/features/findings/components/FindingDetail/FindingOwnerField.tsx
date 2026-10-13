import { apiRequest, useIdempotencyKey } from '@/lib/api';
import { resolveActors } from '@/lib/api/actors';
import { mapUnknownError } from '@/lib/api/errorMapper';
import { FINDING_RESPONSIBILITY_COPY as COPY } from '@/lib/copy/finding-responsibility';
import { GLOSSARY } from '@/lib/copy/glossary';
import { shortId } from '@/lib/identity';
import { invalidateNavCounts } from '@/lib/query/navCounts';
import { type FindingDto, findingDtoSchema } from '@fops/shared';
import {
  Button,
  Callout,
  FieldRow,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fops/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

export function FindingOwnerField({
  finding,
  canManage,
  actorsById,
}: {
  finding: FindingDto;
  canManage: boolean;
  actorsById: Map<string, string>;
}) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState('none');
  const { key, markConsumed } = useIdempotencyKey();
  const client = useQueryClient();
  const teamId = finding.owner_team_id;
  const team = useQuery({
    queryKey: ['actors-resolve', [], teamId ? [teamId] : []],
    enabled: !!teamId,
    queryFn: ({ signal }) => resolveActors({ teamIds: teamId ? [teamId] : [] }, signal),
    retry: false,
  });
  const teamLabel = team.data?.teams?.[0]?.name ?? `${COPY.team} · ${shortId(teamId ?? '')}`;
  const label = finding.owner_actor_id
    ? (actorsById.get(finding.owner_actor_id) ?? GLOSSARY.unknownUser)
    : teamId
      ? teamLabel
      : GLOSSARY.unassigned;
  const mutation = useMutation({
    mutationFn: async () =>
      (
        await apiRequest('PATCH', `/findings/${finding.id}`, findingDtoSchema, {
          idempotencyKey: key,
          body: {
            owner_actor_id: value.startsWith('actor:') ? value.slice(6) : null,
            owner_team_id: value.startsWith('team:') ? value.slice(5) : null,
          },
        })
      ).data,
    onSuccess: (updated) => {
      markConsumed();
      client.setQueryData(['finding', finding.id], updated);
      void client.invalidateQueries({ queryKey: ['finding', finding.id] });
      void client.invalidateQueries({ queryKey: ['findings'] });
      void client.invalidateQueries({ queryKey: ['home'] });
      invalidateNavCounts(client);
      setEditing(false);
    },
    retry: false,
  });
  return (
    <div data-testid="finding-owner-field">
      <FieldRow label={GLOSSARY.owner} inset="none">
        <span>{label}</span>
        {canManage && !editing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              mutation.reset();
              setValue(
                finding.owner_actor_id
                  ? `actor:${finding.owner_actor_id}`
                  : teamId
                    ? `team:${teamId}`
                    : 'none',
              );
              setEditing(true);
            }}
          >
            {COPY.edit}
          </Button>
        )}
      </FieldRow>
      {editing && (
        <div className="flex flex-col gap-2">
          <Select value={value} onValueChange={setValue} disabled={mutation.isPending}>
            <SelectTrigger aria-label={GLOSSARY.owner}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{GLOSSARY.unassigned}</SelectItem>
              {[...actorsById].map(([id, name]) => (
                <SelectItem key={id} value={`actor:${id}`}>
                  {name}
                </SelectItem>
              ))}
              {finding.owner_actor_id && !actorsById.has(finding.owner_actor_id) && (
                <SelectItem value={`actor:${finding.owner_actor_id}`}>
                  {GLOSSARY.unknownUser}
                </SelectItem>
              )}
              {teamId && <SelectItem value={`team:${teamId}`}>{teamLabel}</SelectItem>}
            </SelectContent>
          </Select>
          {mutation.isError && (
            <div role="alert">
              <Callout tone="red">{mapUnknownError(mutation.error).message || COPY.failed}</Callout>
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
              {COPY.save}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={mutation.isPending}
              onClick={() => setEditing(false)}
            >
              {COPY.cancel}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
