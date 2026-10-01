import { useMe } from '@/lib/auth/useMe';
import { useVocDetail } from '@/lib/cross-system/useVocDetail';
import { formatRecordDocumentTitle, useDocumentTitle } from '@/lib/router/document-title';
import type { VocDetailEnvelope, VocSummaryEnvelope } from '@fops/shared';
import { Skeleton } from '@fops/ui';
import * as React from 'react';

import { DetailPanelNotFound } from './DetailPanelNotFound';
import { FullDetailView } from './FullDetailView';
import { SummaryPermissionView } from './SummaryPermissionView';

// ── Props ────────────────────────────────────────────────────────────────────

export interface VocDetailPanelProps {
  vocId: string;
  /** Current Managed System URL scope; an out-of-scope cached selection closes. */
  managedSystemId?: string;
  /** Called when user closes the panel via X button or 404 selection clear. */
  onClose: () => void;
  /** Optional fullscreen toggle handler from useFullscreenPanel (#18). */
  onExpandToggle?: () => void;
}

// ── Type guards ──────────────────────────────────────────────────────────────

/** A summary envelope has permission_decisions but no title field. */
function isSummaryEnvelope(
  data: VocDetailEnvelope | VocSummaryEnvelope,
): data is VocSummaryEnvelope {
  return !('title' in data);
}

// ── Loading skeleton ─────────────────────────────────────────────────────────

function DetailPanelSkeleton(): React.ReactElement {
  return (
    <div className="flex flex-col gap-4 p-4" aria-label="VOC 상세 불러오는 중">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

export function VocDetailPanel({
  vocId,
  managedSystemId,
  onClose,
  onExpandToggle,
  // `null` while the scope-exit effect clears `selected`: rendering the old
  // record for that tick is the bug this panel is closing over.
}: VocDetailPanelProps): React.ReactElement | null {
  const { data, isLoading, isError, isSuccess, isFetching, error } = useVocDetail(vocId);
  const documentTitleRecord =
    isSuccess && !isFetching && data?.id === vocId && 'title' in data
      ? formatRecordDocumentTitle({ displayId: data.display_id, title: data.title })
      : null;
  useDocumentTitle(documentTitleRecord);
  const { data: me } = useMe();
  const selectedScopeExcludesVoc =
    managedSystemId !== undefined &&
    !isLoading &&
    !isError &&
    data !== undefined &&
    data.primary_managed_system_id !== managedSystemId;

  React.useEffect(() => {
    if (selectedScopeExcludesVoc) onClose();
  }, [onClose, selectedScopeExcludesVoc]);

  // 1. Loading
  if (isLoading) {
    return (
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="h-toolbar shrink-0 border-b border-border-subtle flex items-center px-4">
          <Skeleton className="h-4 w-24" />
        </div>
        <DetailPanelSkeleton />
      </div>
    );
  }

  // 2. Error — check 404 first
  if (isError) {
    const code = (error as { code?: string } | null)?.code;
    if (code === 'not_found.record') {
      return <DetailPanelNotFound onClearSelection={onClose} />;
    }
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <p className="text-sm text-text-danger">데이터를 불러오지 못했습니다.</p>
      </div>
    );
  }

  if (!data) {
    return <DetailPanelNotFound onClearSelection={onClose} />;
  }

  if (selectedScopeExcludesVoc) {
    return null;
  }

  // 3. Summary envelope — permission blocked
  if (isSummaryEnvelope(data)) {
    return (
      <SummaryPermissionView
        data={data}
        vocId={vocId}
        onClose={onClose}
        {...(onExpandToggle !== undefined ? { onExpandToggle } : {})}
      />
    );
  }

  // 4. Full detail envelope
  const voc: VocDetailEnvelope = data;
  const isReporterOnOwnVoc = me?.actor.id === voc.reporter_id && voc.triage_state === 'untriaged';
  // Raw Task DTOs are an operator-only surface. Identity uncertainty and every
  // User role fail closed, including the reporter who owns this VOC.
  const canRenderAllowedTask =
    me?.actor.role_level === 'admin' || me?.actor.role_level === 'developer';

  return (
    <FullDetailView
      key={voc.id}
      voc={voc}
      vocId={vocId}
      onClose={onClose}
      {...(managedSystemId !== undefined ? { managedSystemId } : {})}
      {...(onExpandToggle !== undefined ? { onExpandToggle } : {})}
      isReporterOnOwnVoc={isReporterOnOwnVoc}
      canRenderAllowedTask={canRenderAllowedTask}
      me={me ?? null}
    />
  );
}
