// /findings — ADR-0020 ListShell finding list + right detail panel.

import { FindingDetailPanel } from '@/features/integration/components/FindingDetail';
import { useFindingsList } from '@/features/integration/hooks/useFindingsList';
import { useWorkspaceActors } from '@/features/voc/hooks/useWorkspaceActors';
import { ApiError } from '@/lib/api/types';
import type { FindingDto } from '@fops/shared';
import {
  type AvatarUser,
  ListShell,
  ObjectRow,
  OutlineBadge,
  PermissionBlockedPanel,
  Skeleton,
  UserAvatar,
} from '@fops/ui';
import { createFileRoute } from '@tanstack/react-router';
import * as React from 'react';

export const Route = createFileRoute('/_authed/findings/')({
  component: FindingsListPage,
});

export function FindingsListPage(): React.ReactElement {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const selectFinding = React.useCallback((id: string): void => {
    setSelectedId(id);
  }, []);

  return <FindingsListShell selectedId={selectedId} onSelect={selectFinding} />;
}

function FindingsListShell({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}): React.ReactElement {
  const listQuery = useFindingsList();
  const { actors } = useWorkspaceActors();
  const findings = listQuery.data?.items ?? [];
  const actorsById = React.useMemo(() => {
    const map = new Map<string, AvatarUser>();
    for (const actor of actors ?? []) {
      map.set(actor.id, { display_name: actor.display_name });
    }
    return map;
  }, [actors]);

  return (
    <ListShell
      toolbar={{
        title: 'Findings',
        subtitle: 'VOC evidence에서 실행 후보로 승격된 Finding을 검토합니다.',
      }}
      list={
        <FindingsListBody
          findings={findings}
          isPending={listQuery.isPending}
          isError={listQuery.isError}
          isSuccess={listQuery.isSuccess}
          error={listQuery.error}
          selectedId={selectedId}
          actorsById={actorsById}
          onSelect={onSelect}
        />
      }
      detailPanel={
        selectedId ? <FindingDetailPanel findingId={selectedId} /> : <FindingEmptyDetail />
      }
    />
  );
}

function FindingsListBody({
  findings,
  isPending,
  isError,
  isSuccess,
  error,
  selectedId,
  actorsById,
  onSelect,
}: {
  findings: FindingDto[];
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: unknown;
  selectedId: string | null;
  actorsById: Map<string, AvatarUser>;
  onSelect: (id: string) => void;
}): React.ReactElement {
  return (
    <section className="flex min-h-full flex-col">
      <div className="border-b border-border-subtle px-5 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Finding 목록
          </h3>
          {isSuccess ? <span className="text-xs text-text-muted">{findings.length}개</span> : null}
        </div>
      </div>

      {isPending ? (
        <div className="space-y-2 p-4" data-testid="finding-list-skeleton">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : isError && isPermissionDenied(error) ? (
        <PermissionBlockedPanel
          state="denied"
          category="Findings"
          reason={error.message}
          className="m-4"
        />
      ) : isError ? (
        <p className="p-4 text-sm text-accent-danger" data-testid="finding-list-error">
          데이터를 불러오지 못했습니다.
        </p>
      ) : findings.length === 0 ? (
        <div className="p-8 text-center text-sm text-text-muted" data-testid="finding-empty-state">
          생성된 Finding이 없습니다.
        </div>
      ) : (
        <div data-testid="finding-list">
          {findings.map((finding) => (
            <FindingRow
              key={finding.id}
              finding={finding}
              selected={selectedId === finding.id}
              owner={actorsById.get(finding.created_by) ?? null}
              onClick={() => onSelect(finding.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function isPermissionDenied(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.status === 403 &&
    (error.code === 'permission.denied' || error.code === 'permission.scope_required')
  );
}

function FindingRow({
  finding,
  selected,
  owner,
  onClick,
}: {
  finding: FindingDto;
  selected: boolean;
  owner: AvatarUser | null;
  onClick: () => void;
}): React.ReactElement {
  return (
    <ObjectRow
      id={finding.display_id}
      title={finding.title}
      selected={selected}
      density="default"
      severity={finding.severity}
      onClick={onClick}
      badges={<FindingStatusBadge status={finding.status} />}
      meta={
        <>
          <span>{severityLabel(finding.severity)}</span>
          {finding.confidence !== null ? (
            <>
              {dot()}
              <ConfidenceBadge displayId={finding.display_id} confidence={finding.confidence} />
            </>
          ) : null}
          {dot()}
          <span>Evidence {finding.evidence_count}개</span>
          {dot()}
          <span>{formatDate(finding.created_at)}</span>
        </>
      }
      trailing={owner !== null ? <UserAvatar user={owner} size="sm" /> : null}
    />
  );
}

function FindingStatusBadge({
  status,
}: {
  status: FindingDto['status'];
}): React.ReactElement {
  return (
    <OutlineBadge data-testid={`finding-status-badge-${status}`}>
      {statusLabel(status)}
    </OutlineBadge>
  );
}

function ConfidenceBadge({
  displayId,
  confidence,
}: {
  displayId: string;
  confidence: NonNullable<FindingDto['confidence']>;
}): React.ReactElement {
  return (
    <OutlineBadge data-testid={`finding-confidence-badge-${displayId}`}>
      Confidence · {confidenceLabel(confidence)}
    </OutlineBadge>
  );
}

function FindingEmptyDetail(): React.ReactElement {
  return (
    <div
      className="flex h-full items-center justify-center p-6 text-sm text-text-muted"
      data-testid="finding-detail-empty-state"
    >
      Finding을 선택하세요.
    </div>
  );
}

function dot() {
  return <span className="h-1 w-1 rounded-full bg-text-muted/60" aria-hidden="true" />;
}

function formatDate(raw: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
  }).format(new Date(raw));
}

function severityLabel(severity: FindingDto['severity']): string {
  const labels: Record<FindingDto['severity'], string> = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    critical: 'Critical',
  };
  return labels[severity];
}

function confidenceLabel(confidence: NonNullable<FindingDto['confidence']>): string {
  const labels: Record<NonNullable<FindingDto['confidence']>, string> = {
    low: '낮음',
    medium: '중간',
    high: '높음',
  };
  return labels[confidence];
}

function statusLabel(status: FindingDto['status']): string {
  const labels: Record<FindingDto['status'], string> = {
    draft: 'Draft',
    active: 'Active',
    not_actionable: 'Not actionable',
    converted: 'Converted',
    archived: 'Archived',
  };
  return labels[status];
}
