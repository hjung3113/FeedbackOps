import { fetchManagedSystems } from '@/lib/api/managed-systems';
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
