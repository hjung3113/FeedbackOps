import { ApiError, apiRequest, useIdempotencyKey } from '@/lib/api';
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

// The server stays authoritative: a candidate the picker offered but the
// workspace cannot assign surfaces as validation.failed with an owner field
// coded ineligible_actor (apps/backend findings/responsibility.ts).
function hasFieldCode(field: unknown): field is { code: unknown } {
  return typeof field === 'object' && field !== null && 'code' in field;
}

function isIneligibleOwnerError(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.envelope.code !== 'validation.failed') return false;
  const fields = error.envelope.detail?.fields;
  if (!Array.isArray(fields)) return false;
  return fields.some((field) => hasFieldCode(field) && field.code === 'ineligible_actor');
}

export function FindingOwnerField({
  finding,
  canManage,
  actorsById,
  eligibleOwners,
}: {
  finding: FindingDto;
  canManage: boolean;
  actorsById: Map<string, string>;
  eligibleOwners: ReadonlyArray<{ id: string; name: string }>;
}) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState('none');
  const [listOpen, setListOpen] = React.useState(false);
  const editButtonRef = React.useRef<HTMLButtonElement>(null);
  const selectTriggerRef = React.useRef<HTMLButtonElement>(null);
  // Focus handoff: the editor's Select takes focus on open; 저장/취소/Escape
  // return it to the 담당자 변경 trigger after the editor unmounts.
  const restoreFocusRef = React.useRef(false);
  React.useEffect(() => {
    if (editing) {
      selectTriggerRef.current?.focus();
    } else if (restoreFocusRef.current) {
      restoreFocusRef.current = false;
      editButtonRef.current?.focus();
    }
  }, [editing]);
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
      restoreFocusRef.current = true;
      setEditing(false);
    },
    retry: false,
  });

  function cancelEditing(): void {
    if (mutation.isPending) return;
    restoreFocusRef.current = true;
    setEditing(false);
  }
  return (
    <div data-testid="finding-owner-field">
      <FieldRow label={GLOSSARY.owner} inset="none">
        <span className="inline-flex items-center gap-2">
          <span>{label}</span>
          {canManage && !editing && (
            <Button
              ref={editButtonRef}
              variant="secondary"
              size="sm"
              onClick={() => {
                mutation.reset();
                restoreFocusRef.current = false;
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
        </span>
      </FieldRow>
      {editing && (
        <div
          className="flex flex-col gap-2"
          onKeyDown={(event) => {
            // Escape cancels only with the Select listbox closed; while it is
            // open, Escape belongs to Radix (close the listbox) — the portal
            // keeps option-level Escape keydowns out of this handler anyway.
            if (event.key === 'Escape' && !listOpen) {
              event.stopPropagation();
              cancelEditing();
            }
          }}
        >
          <Select
            value={value}
            onValueChange={setValue}
            onOpenChange={setListOpen}
            disabled={mutation.isPending}
          >
            <SelectTrigger ref={selectTriggerRef} aria-label={GLOSSARY.owner}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{GLOSSARY.unassigned}</SelectItem>
              {eligibleOwners.map(({ id, name }) => (
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
              <Callout tone="red">
                {isIneligibleOwnerError(mutation.error)
                  ? COPY.ineligibleOwner
                  : mapUnknownError(mutation.error).message || COPY.failed}
              </Callout>
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
              {COPY.save}
            </Button>
            <Button variant="ghost" size="sm" disabled={mutation.isPending} onClick={cancelEditing}>
              {COPY.cancel}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
