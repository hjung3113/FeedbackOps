import { resolveActors } from '@/lib/api/actors';
import { type ManagedSystemDto, fetchManagedSystems } from '@/lib/api/managed-systems';
import { RESPONSIBILITY_COPY } from '@/lib/copy/tasks';
import { shortId } from '@/lib/identity';
import type { TaskDto } from '@fops/shared';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';

export type TaskSeverity = 'low' | 'medium' | 'high' | 'critical';

export type TaskAssigneeResolution =
  | { kind: 'unassigned' }
  | { kind: 'resolved'; actorId: string; displayName: string }
  | { kind: 'unresolved'; actorId: string };

export function useTaskManagedSystemNames(): ReadonlyMap<string, string> {
  const systemsQuery = useQuery({
    queryKey: ['managed-systems', 'all'] as const,
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived: true, signal }),
    staleTime: 10 * 60 * 1000,
  });

  return React.useMemo(
    () => new Map((systemsQuery.data?.items ?? []).map((system) => [system.id, system.name])),
    [systemsQuery.data?.items],
  );
}

/** Full registry read (same cache as the names hook) for team-picker candidates. */
export function useTaskManagedSystems(): readonly ManagedSystemDto[] {
  const systemsQuery = useQuery({
    queryKey: ['managed-systems', 'all'] as const,
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived: true, signal }),
    staleTime: 10 * 60 * 1000,
  });
  return systemsQuery.data?.items ?? [];
}

export function resolveTaskAssignee(
  assigneeActorId: string | null,
  actorNamesById: ReadonlyMap<string, string>,
): TaskAssigneeResolution {
  if (assigneeActorId === null) return { kind: 'unassigned' };
  const displayName = actorNamesById.get(assigneeActorId);
  return displayName === undefined
    ? { kind: 'unresolved', actorId: assigneeActorId }
    : { kind: 'resolved', actorId: assigneeActorId, displayName };
}

export function taskPriorityToSeverity(priority: TaskDto['priority']): TaskSeverity {
  return priority === 'urgent' ? 'critical' : priority;
}

/** Resolve only persisted team IDs; team membership never becomes personal assignment. */
export function useTaskTeamNames(tasks: readonly TaskDto[]): ReadonlyMap<string, string> {
  const ids = [
    ...new Set(tasks.flatMap((task) => (task.assignee_team_id ? [task.assignee_team_id] : []))),
  ].sort();
  const query = useQuery({
    queryKey: ['actors-resolve', [], ids],
    enabled: ids.length > 0,
    queryFn: ({ signal }) => resolveActors({ teamIds: ids }, signal),
    staleTime: 60_000,
  });
  return React.useMemo(
    () => new Map((query.data?.teams ?? []).map((team) => [team.id, team.name])),
    [query.data],
  );
}

export function taskTeamLabel(teamId: string, names: ReadonlyMap<string, string>): string {
  return names.get(teamId) ?? `팀 ${shortId(teamId)}`;
}

/** Row/card label that marks a team assignee as a team, never a person. */
export function taskTeamMark(teamId: string, names: ReadonlyMap<string, string>): string {
  return `${RESPONSIBILITY_COPY.teamMark} · ${taskTeamLabel(teamId, names)}`;
}
