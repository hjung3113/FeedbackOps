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
  linkMissing: boolean;
  setSelectedId: (id: string | null) => void;
  tabs: ListToolbarTab[];
  shown: TaskRequestDto[];
  names: NameMaps;
  selected: TaskRequestDto | null;
  currentActorId: string | null;
  currentRole: string | null;
  isLoading: boolean;
  queueSettled: boolean;
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
  onSelectionChange,
}: {
  selectedParam?: string | undefined;
  managedSystem?: string | undefined;
  onSelectionChange?: ((id: string | null, replace: boolean) => void) | undefined;
}): UseTaskRequestsQueueResult {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = React.useState<TaskRequestTab>('pending_review');
  const [linkMissing, setLinkMissing] = React.useState(false);
  const [panelClosed, setPanelClosed] = React.useState(false);
  const [panelContext, setPanelContext] = React.useState({ activeTab, managedSystem });
  if (panelContext.activeTab !== activeTab || panelContext.managedSystem !== managedSystem) {
    setPanelContext({ activeTab, managedSystem });
    setPanelClosed(false);
    setLinkMissing(false);
  }
  React.useEffect(() => {
    if (selectedParam !== undefined) {
      setPanelClosed(false);
      setLinkMissing(false);
    }
  }, [selectedParam]);
  const [selection, setSelection] = React.useState({
    param: selectedParam,
    id: selectedParam ?? null,
  });
  // Reconcile URL changes during render so a new scope never sees the previous detail query.
  const selectedId = selection.param === selectedParam ? selection.id : (selectedParam ?? null);
  if (selection.param !== selectedParam) setSelection({ param: selectedParam, id: selectedId });
  const setLocalSelectedId = React.useCallback(
    (id: string | null) => setSelection({ param: selectedParam, id }),
    [selectedParam],
  );
  const setSelectedId = React.useCallback(
    (id: string | null) => {
      setPanelClosed(id === null);
      setLinkMissing(false);
      setLocalSelectedId(id);
      onSelectionChange?.(id, id === null);
    },
    [onSelectionChange, setLocalSelectedId],
  );

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
  const selected =
    !linkMissing && selectedId
      ? (items.find((item) => item.id === selectedId) ?? selectedDetail.data ?? null)
      : null;
  React.useEffect(() => {
    const filteredOut =
      selectedDetail.data?.id === selectedId &&
      selectedDetail.data !== undefined &&
      managedSystem !== undefined &&
      managedSystem !== 'all' &&
      selectedDetail.data.primary_managed_system_id !== managedSystem;
    if (
      (selectedDetail.error instanceof ApiError && selectedDetail.error.status === 404) ||
      filteredOut
    ) {
      setLinkMissing(true);
      setLocalSelectedId(null);
      onSelectionChange?.(null, true);
    }
  }, [
    selectedDetail.data,
    selectedDetail.error,
    managedSystem,
    selectedId,
    setLocalSelectedId,
    onSelectionChange,
  ]);
  const restoredDetail =
    selected?.id === selectedParam
      ? selectedDetail.data?.id === selectedParam
        ? selectedDetail.data
        : selected
      : null;
  const followedParam = React.useRef({ param: selectedParam, consumed: false });
  React.useEffect(() => {
    followedParam.current = { param: selectedParam, consumed: false };
  }, [selectedParam]);
  React.useEffect(() => {
    if (
      selectedParam === undefined ||
      (followedParam.current.param === selectedParam && followedParam.current.consumed) ||
      selectedId !== selectedParam ||
      restoredDetail == null ||
      (managedSystem !== undefined &&
        managedSystem !== 'all' &&
        restoredDetail.primary_managed_system_id !== managedSystem)
    )
      return;
    // Consume even matching statuses and the all tab, so manual tab changes persist.
    followedParam.current = { param: selectedParam, consumed: true };
    const destination =
      TAB_ORDER.find((tab) => tab.value === restoredDetail.status)?.value ?? 'all';
    if (activeTab !== 'all' && activeTab !== destination) setActiveTab(destination);
  }, [selectedParam, selectedId, restoredDetail, managedSystem, activeTab]);

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
    if (
      !panelClosed &&
      !linkMissing &&
      selectedParam === undefined &&
      selectedId === null &&
      shown[0]
    )
      setLocalSelectedId(shown[0].id);
  }, [panelClosed, linkMissing, selectedId, shown, selectedParam, setLocalSelectedId]);

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
      setLocalSelectedId(updatedItem.id);
      onSelectionChange?.(updatedItem.id, true);
    },
    [managedSystem, queryClient, setLocalSelectedId, onSelectionChange],
  );

  return {
    activeTab,
    setActiveTab,
    hasItems: summaryQuery.isSuccess && (summaryQuery.data.page?.total ?? 0) > 0,
    selectedId,
    linkMissing,
    setSelectedId,
    tabs,
    shown,
    names,
    selected,
    currentActorId: meQuery.data?.actor.id ?? null,
    currentRole: meQuery.data?.actor.role_level ?? null,
    isLoading: taskRequestsQuery.isLoading || summaryQuery.isLoading,
    queueSettled:
      taskRequestsQuery.isSuccess &&
      !taskRequestsQuery.isFetching &&
      !taskRequestsQuery.isPlaceholderData,
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
