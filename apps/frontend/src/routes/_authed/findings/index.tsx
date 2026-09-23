// /findings — ADR-0020 ListShell finding list + right detail panel.

import { FindingDetailPanel } from '@/features/findings/components/FindingDetail';
import { useFindingsList } from '@/features/findings/hooks/useFindingsList';
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
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import * as React from 'react';
import { z } from 'zod';

// Selection + Managed System scope are URL state (docs/frontend/routes-and-layout.md
// §URL State Rules): /findings?managedSystem=:managedSystemId|all&selected=:findingId.
// Defaults (scope union / nothing selected) are omitted from the URL. `all` and an
// absent managedSystem both query WITHOUT managed_system_id (the backend applies the
// caller's effective scope union); a uuid is passed through.
export const findingsSearchSchema = z
  .object({
    managedSystem: z.union([z.string().uuid(), z.literal('all')]).optional(),
    selected: z.string().uuid().optional(),
  })
  .strict();

type FindingsSearch = z.infer<typeof findingsSearchSchema>;

export const Route = createFileRoute('/_authed/findings/')({
  validateSearch: (raw) => findingsSearchSchema.parse(raw),
  component: FindingsListPage,
});

export function FindingsListPage(): React.ReactElement {
  const search = useSearch({ strict: false }) as FindingsSearch;
  const navigate = useNavigate({ from: '/findings/' });
  const selectedId = search.selected ?? null;
  const managedSystemId = search.managedSystem === 'all' ? undefined : search.managedSystem;

  const selectFinding = React.useCallback(
    (id: string): void => {
      void navigate({ to: '/findings', search: (prev) => ({ ...prev, selected: id }) });
    },
    [navigate],
  );

  // Stale/invalid `selected` (deleted, or filtered away): once the list has
  // loaded, replace-drop it so Back is not trapped in the invalid URL. While
  // loading — or when the list failed — the deep-linked selection is kept.
  const reconcileSelection = React.useCallback((): void => {
    void navigate({
      to: '/findings',
      replace: true,
      search: ({ selected: _selected, ...rest }) => rest,
    });
  }, [navigate]);

  return (
    <FindingsListShell
      managedSystemId={managedSystemId}
      selectedId={selectedId}
      onSelect={selectFinding}
      onSelectionReconciled={reconcileSelection}
    />
  );
}

function FindingsListShell({
  managedSystemId,
  selectedId,
  onSelect,
  onSelectionReconciled,
}: {
  managedSystemId: string | undefined;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSelectionReconciled: () => void;
}): React.ReactElement {
  const listQuery = useFindingsList(managedSystemId);
  const { actors } = useWorkspaceActors();
  const findings = listQuery.data?.items ?? [];
  const actorsById = React.useMemo(() => {
    const map = new Map<string, AvatarUser>();
    for (const actor of actors ?? []) {
      map.set(actor.id, { display_name: actor.display_name });
    }
    return map;
  }, [actors]);

  React.useEffect(() => {
    if (!listQuery.isSuccess) return;
    if (selectedId !== null && !findings.some((finding) => finding.id === selectedId)) {
      onSelectionReconciled();
    }
  }, [findings, listQuery.isSuccess, onSelectionReconciled, selectedId]);

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
