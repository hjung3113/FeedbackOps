import { fetchMe, fetchTaskRequests, resolveActors } from '@/lib/api';
import { fetchManagedSystems } from '@/lib/api/managed-systems';
import type { TaskRequestDto, TaskRequestStatus } from '@fops/shared';
import type { ListToolbarTab } from '@fops/ui';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';

import type { NameMaps } from './TaskRequestRow';
import { isPermissionDenied } from './predicates';

export type TaskRequestTab = TaskRequestStatus | 'all';

const TAB_ORDER: Array<{ value: TaskRequestTab; label: string }> = [
  { value: 'pending_review', label: 'Pending' },
  { value: 'needs_more_evidence', label: 'Needs evidence' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
];

export interface UseTaskRequestsQueueResult {
  activeTab: TaskRequestTab;
  setActiveTab: (tab: TaskRequestTab) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  tabs: ListToolbarTab[];
  shown: TaskRequestDto[];
  names: NameMaps;
  selected: TaskRequestDto | null;
  currentActorId: string | null;
  currentRole: string | null;
  isLoading: boolean;
  permissionDeniedError: { message: string } | null;
  hasError: boolean;
}

export function useTaskRequestsQueue({
  selectedParam,
  managedSystem,
}: {
  selectedParam?: string | undefined;
  managedSystem?: string | undefined;
}): UseTaskRequestsQueueResult {
  const [activeTab, setActiveTab] = React.useState<TaskRequestTab>('pending_review');
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const taskRequestsQuery = useQuery({
    queryKey: ['task-requests', managedSystem] as const,
    queryFn: ({ signal }) =>
      fetchTaskRequests({
        signal,
        ...(managedSystem !== undefined ? { managed_system_id: managedSystem } : {}),
      }),
  });
  const meQuery = useQuery({
    queryKey: ['me'] as const,
    queryFn: ({ signal }) => fetchMe(signal),
    staleTime: 60 * 1000,
  });
  const managedSystemsQuery = useQuery({
    queryKey: ['managed-systems', 'all'] as const,
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived: true, signal }),
    staleTime: 10 * 60 * 1000,
  });

  const items = taskRequestsQuery.data?.items ?? [];
  const actorIds = React.useMemo(
    () => [
      ...new Set(
        items.flatMap((item) =>
          [item.requester_actor_id, item.reviewer_actor_id].filter(
            (id): id is string => id !== null,
          ),
        ),
      ),
    ],
    [items],
  );
  const actorsQuery = useQuery({
    queryKey: ['actors-resolve', actorIds, []] as const,
    queryFn: ({ signal }) => resolveActors({ actorIds }, signal),
    enabled: actorIds.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  const names = React.useMemo<NameMaps>(() => {
    const actorsById: NameMaps['actorsById'] = {};
    for (const actor of actorsQuery.data?.actors ?? []) {
      actorsById[actor.id] = actor;
    }
    const managedSystemsById: NameMaps['managedSystemsById'] = {};
    for (const ms of managedSystemsQuery.data?.items ?? []) {
      managedSystemsById[ms.id] = { name: ms.name };
    }
    return { actorsById, managedSystemsById };
  }, [actorsQuery.data?.actors, managedSystemsQuery.data?.items]);

  const tabs = React.useMemo<ListToolbarTab[]>(
    () =>
      TAB_ORDER.map((tab) => ({
        value: tab.value,
        label: tab.label,
        badgeCount:
          tab.value === 'all'
            ? items.length
            : items.filter((item) => item.status === tab.value).length,
        urgent: tab.value === 'pending_review',
      })),
    [items],
  );

  const shown = React.useMemo(() => {
    return activeTab === 'all' ? items : items.filter((item) => item.status === activeTab);
  }, [activeTab, items]);

  React.useEffect(() => {
    if (selectedId === null && shown[0]) setSelectedId(shown[0].id);
  }, [selectedId, shown]);

  React.useEffect(() => {
    if (selectedParam !== undefined) setSelectedId(selectedParam);
  }, [selectedParam]);

  const selected = selectedId
    ? (items.find((item) => item.id === selectedId) ?? shown[0] ?? null)
    : null;

  return {
    activeTab,
    setActiveTab,
    selectedId,
    setSelectedId,
    tabs,
    shown,
    names,
    selected,
    currentActorId: meQuery.data?.actor.id ?? null,
    currentRole: meQuery.data?.actor.role_level ?? null,
    isLoading: taskRequestsQuery.isLoading,
    permissionDeniedError: isPermissionDenied(taskRequestsQuery.error)
      ? { message: taskRequestsQuery.error.message }
      : null,
    hasError: taskRequestsQuery.error !== null,
  };
}
