import { fetchTaskRequests, resolveActors } from '@/lib/api';
import { mapUnknownError } from '@/lib/api/errorMapper';
import { fetchManagedSystems } from '@/lib/api/managed-systems';
import { useMe } from '@/lib/auth/useMe';
import { TASK_REQUEST_STATUS_LABELS } from '@/lib/copy/enum-labels';
import { GLOSSARY } from '@/lib/copy/glossary';
import type { TaskRequestDto, TaskRequestStatus } from '@fops/shared';
import type { ListToolbarTab } from '@fops/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import type { NameMaps } from './TaskRequestRow';
import { isPermissionDenied } from './predicates';

export type TaskRequestTab = TaskRequestStatus | 'all';

const TAB_ORDER: Array<{ value: TaskRequestTab; label: string }> = [
  { value: 'pending_review', label: TASK_REQUEST_STATUS_LABELS.pending_review },
  { value: 'needs_more_evidence', label: TASK_REQUEST_STATUS_LABELS.needs_more_evidence },
  { value: 'approved', label: TASK_REQUEST_STATUS_LABELS.approved },
  { value: 'rejected', label: TASK_REQUEST_STATUS_LABELS.rejected },
  { value: 'all', label: GLOSSARY.all },
];

export interface UseTaskRequestsQueueResult {
  activeTab: TaskRequestTab;
  setActiveTab: (tab: TaskRequestTab) => void;
  hasItems: boolean;
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
  refetch: () => void;
  onDecisionComplete: (item: TaskRequestDto) => void;
}

export function useTaskRequestsQueue({
  selectedParam,
  managedSystem,
}: {
  selectedParam?: string | undefined;
  managedSystem?: string | undefined;
}): UseTaskRequestsQueueResult {
  const queryClient = useQueryClient();
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
  const meQuery = useMe();
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
      TAB_ORDER.map((tab) => {
        // #706 — counts are unknown until the read succeeds (covers pending,
        // error, and refetch-after-error without data); unknown must never
        // render as 0 (ListTabs renders badgeCount only when set).
        const base = {
          value: tab.value,
          label: tab.label,
          urgent: tab.value === 'pending_review',
        };
        if (!taskRequestsQuery.isSuccess) return base;
        return {
          ...base,
          badgeCount:
            tab.value === 'all'
              ? items.length
              : items.filter((item) => item.status === tab.value).length,
        };
      }),
    [items, taskRequestsQuery.isSuccess],
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

  const onDecisionComplete = React.useCallback(
    (updatedItem: TaskRequestDto) => {
      queryClient.setQueryData<{ items: TaskRequestDto[] }>(
        ['task-requests', managedSystem],
        (current) =>
          current
            ? {
                ...current,
                items: current.items.map((item) =>
                  item.id === updatedItem.id ? updatedItem : item,
                ),
              }
            : current,
      );
      setActiveTab(TAB_ORDER.find((tab) => tab.value === updatedItem.status)?.value ?? 'all');
      setSelectedId(updatedItem.id);
    },
    [managedSystem, queryClient],
  );

  return {
    activeTab,
    setActiveTab,
    hasItems: items.length > 0,
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
      ? { message: mapUnknownError(taskRequestsQuery.error).message }
      : null,
    hasError: taskRequestsQuery.error !== null,
    refetch: () => {
      void taskRequestsQuery.refetch();
    },
    onDecisionComplete,
  };
}
