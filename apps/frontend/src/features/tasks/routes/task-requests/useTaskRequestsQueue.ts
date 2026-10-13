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

import { useTaskPanelSelection } from '../../hooks/useTaskPanelSelection';
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
  reviewer,
  reviewerTeam,
  onSelectionChange,
}: {
  reviewer?: string | undefined;
  reviewerTeam?: string | undefined;
  selectedParam?: string | undefined;
  managedSystem?: string | undefined;
  onSelectionChange?: ((id: string | null, replace: boolean) => void) | undefined;
}): UseTaskRequestsQueueResult {
  const queryClient = useQueryClient();
  const meQuery = useMe();
  const [activeTab, setActiveTab] = React.useState<TaskRequestTab>('pending_review');
  const [decisionSelection, setDecisionSelection] = React.useState<string | null>(null);
  const scope = managedSystem === undefined ? {} : { managed_system_id: managedSystem };
  const summaryQuery = useQuery({
    queryKey: ['task-requests', managedSystem, 'summary'] as const,
    queryFn: ({ signal }) => fetchTaskRequests({ ...scope, signal, limit: 1 }),
  });
  const taskRequestsQuery = useInfiniteQuery({
    queryKey: [
      'task-requests',
      managedSystem,
      'pages',
      activeTab,
      ...(reviewer === undefined && reviewerTeam === undefined
        ? []
        : [reviewer, reviewerTeam, reviewer === 'me' ? meQuery.data?.actor.id : null]),
    ] as const,
    staleTime: 30_000,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) =>
      fetchTaskRequests({
        ...scope,
        ...(reviewer === undefined ? {} : { reviewer }),
        ...(reviewerTeam === undefined ? {} : { reviewer_team_id: reviewerTeam }),
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
  const { selectedId, linkMissing, setLocalSelectedId, selectRow, closePanel, markLinkMissing } =
    useTaskPanelSelection({
      selectedParam,
      items,
      context: [JSON.stringify([activeTab, reviewer, reviewerTeam]), managedSystem],
      onSelectionChange,
    });
  if (decisionSelection !== null) {
    // Apply after the hook reconciles the result tab, so its context reset cannot drop the decision.
    setLocalSelectedId(decisionSelection);
    setDecisionSelection(null);
  }
  const setSelectedId = React.useCallback(
    (id: string | null) => {
      if (id === null) closePanel();
      else selectRow(id);
    },
    [closePanel, selectRow],
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
      markLinkMissing();
    }
  }, [selectedDetail.data, selectedDetail.error, managedSystem, selectedId, markLinkMissing]);
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

  const managedSystemsQuery = useQuery({
    queryKey: ['managed-systems', 'all'] as const,
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived: true, signal }),
    staleTime: 10 * 60 * 1000,
  });

  const actorIds = React.useMemo(
    () => [
      ...new Set(
        [...items, ...(selected ? [selected] : [])].flatMap((item) =>
          [item.requester_actor_id, item.reviewer_actor_id, item.assigned_reviewer_actor_id].filter(
            (id): id is string => id !== null,
          ),
        ),
      ),
    ],
    [items, selected],
  );
  const teamIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const item of [...items, ...(selected ? [selected] : [])]) {
      if (item.assigned_reviewer_team_id) ids.add(item.assigned_reviewer_team_id);
    }
    // The reviewer filter's team picker offers teams already known in context:
    // the current value and the scoped Managed System defaults.
    if (reviewerTeam) ids.add(reviewerTeam);
    const scoped =
      managedSystem !== undefined && managedSystem !== 'all'
        ? managedSystemsQuery.data?.items.find((system) => system.id === managedSystem)
        : undefined;
    if (scoped?.default_reviewer_team_id) ids.add(scoped.default_reviewer_team_id);
    if (scoped?.default_owner_team_id) ids.add(scoped.default_owner_team_id);
    return [...ids];
  }, [items, selected, reviewerTeam, managedSystem, managedSystemsQuery.data?.items]);
  const actorsQuery = useQuery({
    queryKey: ['actors-resolve', actorIds, teamIds] as const,
    queryFn: ({ signal }) => resolveActors({ actorIds, teamIds }, signal),
    enabled: actorIds.length > 0 || teamIds.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  const names = React.useMemo<NameMaps>(() => {
    const actorsById: NameMaps['actorsById'] = {};
    for (const actor of actorsQuery.data?.actors ?? []) {
      actorsById[actor.id] = actor;
    }
    const managedSystemsById: NameMaps['managedSystemsById'] = {};
    for (const ms of managedSystemsQuery.data?.items ?? []) {
      managedSystemsById[ms.id] = {
        name: ms.name,
        ...(ms.default_reviewer_team_id
          ? { defaultReviewerTeamId: ms.default_reviewer_team_id }
          : {}),
        ...(ms.default_owner_team_id ? { defaultOwnerTeamId: ms.default_owner_team_id } : {}),
      };
    }
    const teamsById = Object.fromEntries(
      (actorsQuery.data?.teams ?? []).map((team) => [team.id, { name: team.name }]),
    );
    return {
      actorsById,
      managedSystemsById,
      ...(Object.keys(teamsById).length > 0 ? { teamsById } : {}),
    };
  }, [actorsQuery.data?.actors, actorsQuery.data?.teams, managedSystemsQuery.data?.items]);

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
      setDecisionSelection(updatedItem.id);
      onSelectionChange?.(updatedItem.id, true);
    },
    [managedSystem, queryClient, onSelectionChange],
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
