// VOC Cluster list shell: tab filter, visible cluster list, selection
// reconciliation, and the detail slot. The list route (search `selected`) and the
// detail route (path `clusterId`) both host this shell; selection storage is the
// route's concern. Screens live in features/voc-cluster per AGENTS ownership.

import { ListStateMessage } from '@/components/ListStateMessage';
import { useVocClusterDetail } from '@/features/voc-cluster/hooks/useVocClusterDetail';
import { useVocClusterList } from '@/features/voc-cluster/hooks/useVocClusterList';
import { isPermissionDenied } from '@/lib/api';
import { useMe } from '@/lib/auth/useMe';
import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import { CLUSTER_SUGGESTION_COPY } from '@/lib/copy/voc-cluster';
import { formatShortDate } from '@/lib/format/datetime';
import {
  ListShell,
  ListToolbar,
  type ListToolbarTab,
  ObjectRow,
  PermissionBlockedPanel,
  SkeletonRows,
} from '@fops/ui';
import * as React from 'react';
import { useState } from 'react';
import {
  clusterSuggestionActorContext,
  useClusterSuggestions,
} from '../../hooks/useClusterSuggestions';
import { ClusterSuggestionSession } from '../suggestions/ClusterSuggestionSession';

import { ClusterStatusBadge } from '../../lib/presentation';
import type { VocClusterListPresentation } from '../types';
import { VocClusterDetailPanel } from './VocClusterDetailPanel';

export function VocClusterListShell({
  selectedId,
  onSelect,
  toolbarActions,
  onCloseDetail,
  defaultToFirst = false,
  managedSystemId,
  onSuggestionModeChange,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  toolbarActions?: React.ReactNode;
  /** `reconcile: true` = the shell dropped a selection that fell out of the visible list (not a user close). */
  onCloseDetail: (opts?: { reconcile?: boolean }) => void;
  defaultToFirst?: boolean;
  /** Optional scope from the list route's `managedSystem` URL param (undefined = caller's scope union). */
  managedSystemId?: string | undefined;
  onSuggestionModeChange?: (active: boolean, options?: { preserveSelection: boolean }) => void;
}): React.ReactElement {
  const listQuery = useVocClusterList(managedSystemId);
  const clusters = listQuery.data?.items ?? [];
  const { data: me } = useMe();
  const eligible = me?.actor.role_level === 'admin' || me?.actor.role_level === 'developer';
  const actorContext = clusterSuggestionActorContext(me);
  const suggestionsQuery = useClusterSuggestions(managedSystemId, actorContext, eligible);
  const suggestionsAvailable =
    suggestionsQuery.isSuccess && suggestionsQuery.data?.available === true;
  const sessionContext = `${managedSystemId ?? 'all'}:${actorContext}`;
  const [activeTab, setActiveTab] = useState<ClusterTab>('all');
  const [selectionPaused, setSelectionPaused] = useState(false);
  const suggestionMode = eligible && suggestionsAvailable && activeTab === 'suggestions';
  const [suggestionSlots, setSuggestionSlots] = useState<{
    panel: React.ReactNode;
    count: number | undefined;
    context: string;
  }>({ panel: null, count: undefined, context: '' });
  const automaticExit = activeTab === 'suggestions' && !suggestionMode;
  const pauseClusterSelection = suggestionMode || automaticExit || selectionPaused;
  React.useEffect(() => {
    if (automaticExit) {
      setActiveTab('all');
      setSelectionPaused(true);
    }
    onSuggestionModeChange?.(suggestionMode, {
      preserveSelection: automaticExit || selectionPaused,
    });
  }, [automaticExit, selectionPaused, suggestionMode, onSuggestionModeChange]);
  const receiveSuggestionSlots = React.useCallback(
    (slots: { panel: React.ReactNode; count: number | undefined }) => {
      setSuggestionSlots({ ...slots, context: sessionContext });
    },
    [sessionContext],
  );
  function changeTab(tab: ClusterTab) {
    setSelectionPaused(false);
    onSuggestionModeChange?.(tab === 'suggestions', { preserveSelection: false });
    setActiveTab(tab);
  }

  const matchesActiveTab = React.useCallback(
    (cluster: { status: string; linked_findings?: unknown[] | undefined }) => {
      if (activeTab === 'confirmed') return cluster.status === 'confirmed';
      if (activeTab === 'no-finding') return (cluster.linked_findings ?? []).length === 0;
      return true;
    },
    [activeTab],
  );
  const visibleClusters = clusters.filter(matchesActiveTab);
  const selectedInList =
    selectedId !== null && clusters.some((cluster) => cluster.id === selectedId);
  const selectedAbsentFromList =
    !pauseClusterSelection && listQuery.isSuccess && selectedId !== null && !selectedInList;
  const selectedDetailQuery = useVocClusterDetail(selectedAbsentFromList ? selectedId : null);
  const selectedVisibleInList =
    selectedId !== null && visibleClusters.some((cluster) => cluster.id === selectedId);

  React.useEffect(() => {
    if (!pauseClusterSelection && defaultToFirst && selectedId === null && visibleClusters[0])
      onSelect(visibleClusters[0].id);
  }, [pauseClusterSelection, defaultToFirst, onSelect, selectedId, visibleClusters]);

  React.useEffect(() => {
    if (pauseClusterSelection || !listQuery.isSuccess || selectedId === null) return;

    if (selectedInList) {
      if (!selectedVisibleInList) onCloseDetail({ reconcile: true });
      return;
    }

    if (!selectedDetailQuery.isSuccess || selectedDetailQuery.isFetching) return;
    const outsideManagedSystem =
      managedSystemId !== undefined &&
      selectedDetailQuery.data.primary_managed_system_id !== managedSystemId;
    if (outsideManagedSystem || !matchesActiveTab(selectedDetailQuery.data))
      onCloseDetail({ reconcile: true });
  }, [
    managedSystemId,
    matchesActiveTab,
    onCloseDetail,
    pauseClusterSelection,
    listQuery.isSuccess,
    selectedDetailQuery.data,
    selectedDetailQuery.isSuccess,
    selectedDetailQuery.isFetching,
    selectedId,
    selectedInList,
    selectedVisibleInList,
  ]);

  const resolvedAbsentDetailIsVisible =
    selectedAbsentFromList &&
    (selectedDetailQuery.isPending ||
      selectedDetailQuery.isFetching ||
      selectedDetailQuery.isError ||
      (selectedDetailQuery.isSuccess &&
        (managedSystemId === undefined ||
          selectedDetailQuery.data.primary_managed_system_id === managedSystemId) &&
        matchesActiveTab(selectedDetailQuery.data)));

  return (
    <ListShell
      toolbar={{
        title: 'VOC Cluster',
        subtitle: 'VOC를 유사 주제로 묶어 Finding으로 승격합니다.',
        actions: toolbarActions,
      }}
      list={
        <ClusterListBody
          clusters={visibleClusters}
          allClusters={clusters}
          isPending={listQuery.isPending}
          isError={listQuery.isError}
          error={listQuery.error}
          onRetry={() => void listQuery.refetch()}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectionPaused(false);
            onSuggestionModeChange?.(false, { preserveSelection: false });
            onSelect(id);
          }}
          activeTab={activeTab}
          onTabChange={changeTab}
          suggestionEligible={eligible && suggestionsAvailable}
          suggestionCount={
            suggestionMode && suggestionSlots.context === sessionContext
              ? suggestionSlots.count
              : suggestionsAvailable
                ? suggestionsQuery.data?.items.length
                : undefined
          }
          suggestionList={
            suggestionMode ? (
              <ClusterSuggestionSession
                key={`${managedSystemId ?? 'all'}:${actorContext}`}
                managedSystemId={managedSystemId}
                actorContext={actorContext}
                onSlots={receiveSuggestionSlots}
              >
                {({ list }) => list}
              </ClusterSuggestionSession>
            ) : undefined
          }
        />
      }
      detailPanel={
        suggestionMode ? (
          suggestionSlots.context === sessionContext ? (
            suggestionSlots.panel
          ) : null
        ) : selectedVisibleInList || resolvedAbsentDetailIsVisible ? (
          <VocClusterDetailPanel
            key={selectedId}
            clusterId={selectedId}
            onClose={() => onCloseDetail()}
          />
        ) : undefined
      }
    />
  );
}

type ClusterTab = 'all' | 'confirmed' | 'no-finding' | 'suggestions';

function dot() {
  return <span className="h-1 w-1 rounded-full bg-text-muted/60" aria-hidden="true" />;
}

function ClusterListBody({
  clusters,
  allClusters,
  isPending,
  isError,
  error,
  onRetry,
  selectedId,
  onSelect,
  activeTab,
  onTabChange,
  suggestionEligible,
  suggestionCount,
  suggestionList,
}: {
  clusters: VocClusterListPresentation[];
  allClusters: VocClusterListPresentation[];
  isPending: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  activeTab: ClusterTab;
  onTabChange: (tab: ClusterTab) => void;
  suggestionEligible: boolean;
  suggestionCount: number | undefined;
  suggestionList: React.ReactNode;
}): React.ReactElement {
  // #706 — counts are unknown until the list read succeeds (covers pending,
  // error, and refetch-after-error without data); unknown must never render
  // as 0 (ListTabs renders badgeCount only when set).
  const countsKnown = !isPending && !isError;
  const tabs: ListToolbarTab[] = [
    {
      value: 'all',
      label: '전체',
      ...(countsKnown ? { badgeCount: allClusters.length } : {}),
      id: 'cluster-tab-all',
      controlsId: 'cluster-list-panel',
      testId: 'cluster-tab-all',
    },
    {
      value: 'confirmed',
      label: '확정',
      ...(countsKnown
        ? { badgeCount: allClusters.filter((cluster) => cluster.status === 'confirmed').length }
        : {}),
      id: 'cluster-tab-confirmed',
      controlsId: 'cluster-list-panel',
      testId: 'cluster-tab-confirmed',
    },
    {
      value: 'no-finding',
      label: 'Finding 없음',
      ...(countsKnown
        ? {
            badgeCount: allClusters.filter(
              (cluster) => (cluster.linked_findings ?? []).length === 0,
            ).length,
          }
        : {}),
      id: 'cluster-tab-no-finding',
      controlsId: 'cluster-list-panel',
      testId: 'cluster-tab-no-finding',
    },
  ];
  if (suggestionEligible)
    tabs.push({
      value: 'suggestions',
      label: CLUSTER_SUGGESTION_COPY.tab,
      ...(suggestionCount !== undefined ? { badgeCount: suggestionCount } : {}),
      id: 'cluster-tab-suggestions',
      controlsId: 'cluster-list-panel',
      testId: 'cluster-tab-suggestions',
    });
  const isReadDenied = isError && isPermissionDenied(error);

  return (
    <section className="flex min-h-full flex-col">
      {!isReadDenied ? (
        <ListToolbar
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={(next) => onTabChange(next as typeof activeTab)}
          tabsAriaLabel="Cluster 필터"
        />
      ) : null}

      <div
        id="cluster-list-panel"
        {...(!isReadDenied
          ? { role: 'tabpanel', 'aria-labelledby': `cluster-tab-${activeTab}` }
          : {})}
      >
        {activeTab === 'suggestions' && suggestionList ? (
          suggestionList
        ) : isPending ? (
          <div className="space-y-2 p-4" data-testid="cluster-list-skeleton">
            <SkeletonRows count={3} size="compact" />
          </div>
        ) : isError && isPermissionDenied(error) ? (
          <PermissionBlockedPanel
            state="denied"
            category="VOC Cluster list"
            reason={PERMISSION_BLOCKED_REASONS.vocClusterList}
            className="m-4"
          />
        ) : isError ? (
          <div data-testid="cluster-list-error">
            <ListStateMessage
              variant="error"
              title="VOC Cluster 목록을 불러오지 못했습니다"
              body="잠시 후 다시 시도하세요."
              action={{ label: '다시 시도', onClick: onRetry }}
            />
          </div>
        ) : allClusters.length === 0 ? (
          <div data-testid="cluster-empty-state">
            <ListStateMessage
              variant="empty"
              title="생성된 VOC Cluster가 없습니다."
              body="VOC를 묶어 만든 Cluster가 여기에 표시됩니다."
            />
          </div>
        ) : clusters.length === 0 ? (
          // Prototype title casing is surface-specific; the reset action follows ADR-0052.
          <ListStateMessage
            variant="filtered"
            title="이 필터에 해당하는 Cluster가 없습니다"
            body={`선택한 조건: ${activeTab === 'confirmed' ? '확정' : 'Finding 없음'}`}
            action={{
              label: '필터 초기화',
              onClick: () => onTabChange('all'),
            }}
          />
        ) : (
          <div data-testid="cluster-list">
            {clusters.map((cluster) => (
              <ClusterRow
                key={cluster.id}
                cluster={cluster}
                selected={selectedId === cluster.id}
                onClick={() => onSelect(cluster.id)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ClusterRow({
  cluster,
  selected,
  onClick,
}: {
  cluster: VocClusterListPresentation;
  selected: boolean;
  onClick: () => void;
}): React.ReactElement {
  const memberCount = cluster.member_count;

  return (
    <ObjectRow
      id={cluster.display_id}
      title={cluster.title}
      selected={selected}
      density="default"
      onClick={onClick}
      badges={<ClusterStatusBadge status={cluster.status} surface="list" />}
      meta={
        <>
          <span>VOC {memberCount}개</span>
          {dot()}
          <span>{formatShortDate(cluster.created_at)}</span>
        </>
      }
    />
  );
}
