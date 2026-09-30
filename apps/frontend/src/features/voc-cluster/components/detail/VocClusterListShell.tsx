// VOC Cluster list shell: tab filter, visible cluster list, selection
// reconciliation, and the detail slot. The list route (search `selected`) and the
// detail route (path `clusterId`) both host this shell; selection storage is the
// route's concern. Screens live in features/voc-cluster per AGENTS ownership.

import { ListStateMessage } from '@/components/ListStateMessage';
import { useVocClusterList } from '@/features/voc-cluster/hooks/useVocClusterList';
import { isPermissionDenied } from '@/lib/api';
import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import { Button, ListShell, ObjectRow, PermissionBlockedPanel, Skeleton } from '@fops/ui';
import * as React from 'react';
import { useState } from 'react';

import { ClusterStatusBadge, formatClusterDate } from '../../lib/presentation';
import type { VocClusterListPresentation } from '../types';
import { VocClusterDetailPanel } from './VocClusterDetailPanel';

export function VocClusterListShell({
  selectedId,
  onSelect,
  toolbarActions,
  onCloseDetail,
  defaultToFirst = false,
  managedSystemId,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  toolbarActions?: React.ReactNode;
  /** `reconcile: true` = the shell dropped a selection that fell out of the visible list (not a user close). */
  onCloseDetail: (opts?: { reconcile?: boolean }) => void;
  defaultToFirst?: boolean;
  /** Optional scope from the list route's `managedSystem` URL param (undefined = caller's scope union). */
  managedSystemId?: string | undefined;
}): React.ReactElement {
  const listQuery = useVocClusterList(managedSystemId);
  const clusters = listQuery.data?.items ?? [];
  const [activeTab, setActiveTab] = useState<'all' | 'confirmed' | 'no-finding'>('all');
  const visibleClusters = clusters.filter((cluster) => {
    if (activeTab === 'confirmed') return cluster.status === 'confirmed';
    if (activeTab === 'no-finding') return (cluster.linked_findings ?? []).length === 0;
    return true;
  });

  React.useEffect(() => {
    if (defaultToFirst && selectedId === null && visibleClusters[0])
      onSelect(visibleClusters[0].id);
  }, [defaultToFirst, onSelect, selectedId, visibleClusters]);

  React.useEffect(() => {
    if (
      listQuery.isSuccess &&
      selectedId !== null &&
      !visibleClusters.some((cluster) => cluster.id === selectedId)
    ) {
      onCloseDetail({ reconcile: true });
    }
  }, [listQuery.isSuccess, onCloseDetail, selectedId, visibleClusters]);

  return (
    <ListShell
      toolbar={{
        title: 'VOC 클러스터',
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
          onSelect={onSelect}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      }
      detailPanel={
        selectedId !== null && visibleClusters.some((cluster) => cluster.id === selectedId) ? (
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
}: {
  clusters: VocClusterListPresentation[];
  allClusters: VocClusterListPresentation[];
  isPending: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  activeTab: 'all' | 'confirmed' | 'no-finding';
  onTabChange: (tab: 'all' | 'confirmed' | 'no-finding') => void;
}): React.ReactElement {
  const tabs = [
    { key: 'all' as const, label: '전체', count: allClusters.length },
    {
      key: 'confirmed' as const,
      label: '확정',
      count: allClusters.filter((cluster) => cluster.status === 'confirmed').length,
    },
    {
      key: 'no-finding' as const,
      label: 'Finding 없음',
      count: allClusters.filter((cluster) => (cluster.linked_findings ?? []).length === 0).length,
    },
  ];

  return (
    <section className="flex min-h-full flex-col">
      <div
        className="flex h-toolbar items-center justify-between gap-3 border-b border-border-subtle bg-surface-canvas px-4"
        data-toolbar-height="50"
      >
        <div
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap"
          role="tablist"
          aria-label="클러스터 필터"
        >
          {tabs.map((tab) => (
            <Button
              key={tab.key}
              type="button"
              variant={activeTab === tab.key ? 'secondary' : 'ghost'}
              size="sm"
              role="tab"
              id={`cluster-tab-${tab.key}`}
              aria-controls="cluster-list-panel"
              aria-selected={activeTab === tab.key}
              onClick={() => onTabChange(tab.key)}
              data-testid={`cluster-tab-${tab.key}`}
            >
              {tab.label} {tab.count}
            </Button>
          ))}
        </div>
        <span className="shrink-0 text-xs text-text-muted">{clusters.length}개</span>
      </div>

      <div id="cluster-list-panel" role="tabpanel" aria-labelledby={`cluster-tab-${activeTab}`}>
        {isPending ? (
          <div className="space-y-2 p-4" data-testid="cluster-list-skeleton">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
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
            title="이 필터에 해당하는 cluster가 없습니다"
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
          <span>{formatClusterDate(cluster.created_at)}</span>
        </>
      }
    />
  );
}
