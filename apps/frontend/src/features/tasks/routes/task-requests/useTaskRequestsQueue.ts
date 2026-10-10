import { fetchTaskRequests, getTaskRequest, resolveActors } from '@/lib/api';
import { mapUnknownError } from '@/lib/api/errorMapper';
import { fetchManagedSystems } from '@/lib/api/managed-systems';
import { ApiError } from '@/lib/api/types';
import { useMe } from '@/lib/auth/useMe';
import { TASK_REQUEST_STATUS_LABELS } from '@/lib/copy/enum-labels';
import { GLOSSARY } from '@/lib/copy/glossary';
import type { ListTaskRequestsResponse } from '@fops/shared';
import type { TaskRequestDto, TaskRequestStatus } from '@fops/shared';
import type { ListToolbarTab } from '@fops/ui';
import {
  type InfiniteData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as React from 'react';

import type { NameMaps } from './TaskRequestRow';
import { isPermissionDenied } from './predicates';

const PAGE_SIZE = 50;

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
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreError: boolean;
  loadMore: () => void;
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

  const scope = managedSystem === undefined ? {} : { managed_system_id: managedSystem };
  const summaryQuery = useQuery({
    queryKey: ['task-requests', managedSystem, 'summary'] as const,
    queryFn: ({ signal }) => fetchTaskRequests({ ...scope, signal, limit: 1 }),
  });
  const taskRequestsQuery = useInfiniteQuery({
    queryKey: ['task-requests', managedSystem, 'pages', activeTab] as const,
    staleTime: 30_000,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) =>
      fetchTaskRequests({
        ...scope,
        signal,
        limit: PAGE_SIZE,
        ...(activeTab === 'all' ? {} : { status: activeTab }),
        ...(pageParam === undefined ? {} : { cursor: pageParam }),
      }),
    getNextPageParam: (last) => (last.page?.has_more ? last.page.cursor : undefined),
  });
  const items = React.useMemo(
    () => taskRequestsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [taskRequestsQuery.data],
  );
  const selectedDetail = useQuery({
    queryKey: ['task-request', selectedId] as const,
    queryFn: ({ signal }) => getTaskRequest(selectedId as string, signal),
    enabled:
      selectedId !== null &&
      taskRequestsQuery.isSuccess &&
      !items.some((item) => item.id === selectedId),
    staleTime: 30_000,
    retry: false,
  });
  const selected = selectedId
    ? (items.find((item) => item.id === selectedId) ?? selectedDetail.data ?? null)
    : null;
  React.useEffect(() => {
    const filteredOut =
      selectedDetail.data !== undefined &&
      managedSystem !== undefined &&
      managedSystem !== 'all' &&
      selectedDetail.data.primary_managed_system_id !== managedSystem;
    if (
      (selectedDetail.error instanceof ApiError && selectedDetail.error.status === 404) ||
      filteredOut
    )
      setSelectedId(null);
  }, [selectedDetail.data, selectedDetail.error, managedSystem]);
  const meQuery = useMe();
  const managedSystemsQuery = useQuery({
    queryKey: ['managed-systems', 'all'] as const,
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived: true, signal }),
    staleTime: 10 * 60 * 1000,
  });

  const actorIds = React.useMemo(
    () => [
      ...new Set(
        [...items, ...(selected ? [selected] : [])].flatMap((item) =>
          [item.requester_actor_id, item.reviewer_actor_id].filter(
            (id): id is string => id !== null,
          ),
        ),
      ),
    ],
    [items, selected],
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
        if (!summaryQuery.isSuccess || summaryQuery.data.page?.status_counts === undefined)
          return base;
        return {
          ...base,
          badgeCount:
            tab.value === 'all'
              ? (summaryQuery.data.page.total ?? 0)
              : summaryQuery.data.page.status_counts[tab.value],
        };
      }),
    [summaryQuery.data, summaryQuery.isSuccess],
  );

  const shown = items;

  React.useEffect(() => {
    if (selectedParam === undefined && selectedId === null && shown[0]) setSelectedId(shown[0].id);
  }, [selectedId, shown, selectedParam]);

  React.useEffect(() => {
    if (selectedParam !== undefined) setSelectedId(selectedParam);
  }, [selectedParam]);

  const onDecisionComplete = React.useCallback(
    (updatedItem: TaskRequestDto) => {
      queryClient.setQueryData(['task-request', updatedItem.id], updatedItem);
      queryClient.setQueriesData<InfiniteData<ListTaskRequestsResponse>>(
        { queryKey: ['task-requests', managedSystem, 'pages'] },
        (current) =>
          current
            ? {
                ...current,
                pages: current.pages.map((page) => ({
                  ...page,
                  items: page.items.filter((item) => item.id !== updatedItem.id),
                })),
              }
            : current,
      );
      void queryClient.invalidateQueries({ queryKey: ['task-requests', managedSystem] });
      setActiveTab(TAB_ORDER.find((tab) => tab.value === updatedItem.status)?.value ?? 'all');
      setSelectedId(updatedItem.id);
    },
    [managedSystem, queryClient],
  );

  return {
    activeTab,
    setActiveTab,
    hasItems: summaryQuery.isSuccess && (summaryQuery.data.page?.total ?? 0) > 0,
    selectedId,
    setSelectedId,
    tabs,
    shown,
    names,
    selected,
    currentActorId: meQuery.data?.actor.id ?? null,
    currentRole: meQuery.data?.actor.role_level ?? null,
    isLoading: taskRequestsQuery.isLoading || summaryQuery.isLoading,
    permissionDeniedError: isPermissionDenied(taskRequestsQuery.error ?? summaryQuery.error)
      ? { message: mapUnknownError(taskRequestsQuery.error ?? summaryQuery.error).message }
      : null,
    hasError:
      (taskRequestsQuery.error !== null && !taskRequestsQuery.isFetchNextPageError) ||
      summaryQuery.isError,
    refetch: () => {
      void taskRequestsQuery.refetch();
      void summaryQuery.refetch();
    },
    onDecisionComplete,
    hasMore: taskRequestsQuery.hasNextPage,
    loadingMore: taskRequestsQuery.isFetchingNextPage,
    loadMoreError: taskRequestsQuery.isFetchNextPageError,
    loadMore: () => {
      void taskRequestsQuery.fetchNextPage();
    },
  };
}
