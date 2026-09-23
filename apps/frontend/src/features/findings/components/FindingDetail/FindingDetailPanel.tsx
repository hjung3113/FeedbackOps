// FindingDetailPanel — state machine for the Finding detail page.
// States: loading skeleton → not-found → permission-blocked → full detail.
// Mirrors VocDetailPanel structure per domain-module-boundaries §Frontend Boundary Rules.

import { Button, EmptyState, PermissionBlockedPanel, Skeleton } from '@fops/ui';
import { useNavigate } from '@tanstack/react-router';
import type * as React from 'react';
import { useFindingDetail } from '../../hooks/useFindingDetail';
import { FullFindingDetail } from './FullFindingDetail';

// ── Props ────────────────────────────────────────────────────────────────────

export interface FindingDetailPanelProps {
  findingId: string;
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
        <Button variant="outline" size="sm" onClick={() => void navigate({ to: '/vocs' })}>
          VOC 목록으로
        </Button>
      }
      className="px-6"
    />
  );
}
// ── Orchestrator ─────────────────────────────────────────────────────────────

export function FindingDetailPanel({ findingId }: FindingDetailPanelProps): React.ReactElement {
  const { data, isLoading, isError, error } = useFindingDetail(findingId);

  // 1. Loading
  if (isLoading) {
    return (
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="h-12 border-b border-border-subtle flex items-center px-6">
          <Skeleton className="h-4 w-32" />
        </div>
        <FindingDetailSkeleton />
      </div>
    );
  }

  // 2. Error
  if (isError) {
    const code = (error as { code?: string } | null)?.code;
    if (code === 'not_found.record') {
      return <FindingNotFound />;
    }
    // permission.denied → finding.read blocked
    if (code === 'permission.denied') {
      return (
        <div className="flex flex-col h-full">
          <div className="h-12 border-b border-border-subtle flex items-center px-6">
            <span className="text-sm font-medium text-text-primary">Finding 상세</span>
          </div>
          <div className="flex-1 flex items-center justify-center p-6">
            <PermissionBlockedPanel
              state="denied"
              category="Finding 상세"
              reason="finding.read 권한이 없습니다. 해당 Managed System의 Developer 이상 권한이 필요합니다."
            />
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <p className="text-sm text-feedback-error">데이터를 불러오지 못했습니다.</p>
      </div>
    );
  }

  if (!data) {
    return <FindingNotFound />;
  }

  // 3. Full detail
  return <FullFindingDetail finding={data} />;
}
