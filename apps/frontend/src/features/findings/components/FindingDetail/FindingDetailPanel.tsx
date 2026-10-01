// FindingDetailPanel — state machine for the Finding detail page.
// States: loading skeleton → not-found → permission-blocked → full detail.
// Mirrors VocDetailPanel structure per domain-module-boundaries §Frontend Boundary Rules.

import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import { formatRecordDocumentTitle, useDocumentTitle } from '@/lib/router/document-title';
import { Button, DetailPanelHeader, EmptyState, PermissionBlockedPanel, Skeleton } from '@fops/ui';
import { useNavigate } from '@tanstack/react-router';
import type * as React from 'react';
import { useFindingDetail } from '../../hooks/useFindingDetail';
import { FullFindingDetail } from './FullFindingDetail';

// ── Props ────────────────────────────────────────────────────────────────────

export interface FindingDetailPanelProps {
  findingId: string;
  headerExtras?: React.ReactNode;
}

function FindingPanelLayout({
  id,
  headerExtras,
  children,
}: {
  id?: string;
  headerExtras: React.ReactNode | undefined;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-detail">
      <DetailPanelHeader
        kind="finding"
        {...(id !== undefined ? { id } : {})}
        {...(headerExtras !== undefined ? { extras: headerExtras } : {})}
      />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

// ── Loading skeleton ─────────────────────────────────────────────────────────

function FindingDetailSkeleton(): React.ReactElement {
  return (
    <div className="flex flex-col gap-4 p-6" aria-label="Finding 상세 불러오는 중">
      <Skeleton className="h-7 w-1/2" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-6 w-20" />
      </div>
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-4 w-1/3" />
    </div>
  );
}

// ── Not found ────────────────────────────────────────────────────────────────

function FindingNotFound(): React.ReactElement {
  const navigate = useNavigate();
  return (
    <EmptyState
      title="Finding을 찾을 수 없습니다."
      body="해당 Finding은 삭제되었거나 접근 권한이 없습니다."
      action={
        <Button variant="outline" size="sm" onClick={() => void navigate({ to: '/findings' })}>
          Findings 목록으로
        </Button>
      }
      className="px-6"
    />
  );
}
// ── Orchestrator ─────────────────────────────────────────────────────────────

export function FindingDetailPanel({
  findingId,
  headerExtras,
}: FindingDetailPanelProps): React.ReactElement {
  const { data, isLoading, isError, isSuccess, isFetching, error } = useFindingDetail(findingId);
  useDocumentTitle(
    isSuccess && !isFetching && data?.id === findingId
      ? formatRecordDocumentTitle({ displayId: data.display_id, title: data.title })
      : null,
  );

  // 1. Loading
  if (isLoading) {
    return (
      <FindingPanelLayout headerExtras={headerExtras}>
        <div className="h-full overflow-y-auto">
          <FindingDetailSkeleton />
        </div>
      </FindingPanelLayout>
    );
  }

  // 2. Error
  if (isError) {
    const code = (error as { code?: string } | null)?.code;
    if (code === 'not_found.record') {
      return (
        <FindingPanelLayout headerExtras={headerExtras}>
          <FindingNotFound />
        </FindingPanelLayout>
      );
    }
    // permission.denied → finding.read blocked
    if (code === 'permission.denied') {
      return (
        <FindingPanelLayout headerExtras={headerExtras}>
          <div className="flex h-full items-center justify-center p-6">
            <PermissionBlockedPanel
              state="denied"
              category="Finding 상세"
              reason={PERMISSION_BLOCKED_REASONS.findingDetail}
            />
          </div>
        </FindingPanelLayout>
      );
    }
    return (
      <FindingPanelLayout headerExtras={headerExtras}>
        <div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
          <p className="text-sm text-text-danger">데이터를 불러오지 못했습니다.</p>
        </div>
      </FindingPanelLayout>
    );
  }

  if (!data) {
    return (
      <FindingPanelLayout headerExtras={headerExtras}>
        <FindingNotFound />
      </FindingPanelLayout>
    );
  }

  // 3. Full detail
  return (
    <FindingPanelLayout
      {...(data.id === findingId ? { id: data.display_id } : {})}
      headerExtras={headerExtras}
    >
      <FullFindingDetail key={data.id} finding={data} />
    </FindingPanelLayout>
  );
}
