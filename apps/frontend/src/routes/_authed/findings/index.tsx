// /findings — ADR-0020 ListShell finding list + right detail panel.

import { ListStateMessage } from '@/components/ListStateMessage';
import { FindingDetailPanel } from '@/features/findings/components/FindingDetail';
import { useFindingsList } from '@/features/findings/hooks/useFindingsList';
import { isPermissionDenied } from '@/lib/api/types';
import {
  FINDING_CONFIDENCE_LABELS,
  FINDING_SEVERITY_LABELS,
  FINDING_STATUS_LABELS,
} from '@/lib/copy/enum-labels';
import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import { parseRouteSearch } from '@/lib/router/search';
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
import { ChevronLeft } from 'lucide-react';
import * as React from 'react';
import { z } from 'zod';
import { vocSearchSchema } from '../vocs';

// Selection + Managed System scope are URL state (docs/frontend/routes-and-layout.md
// §URL State Rules): /findings?managedSystem=:managedSystemId|all&selected=:findingId.
// Defaults (scope union / nothing selected) are omitted from the URL. `all` and an
// absent managedSystem both query WITHOUT managed_system_id (the backend applies the
// caller's effective scope union); a uuid is passed through.
// execution=none is the coverage gap hop. `returnTo` carries a same-origin VOC list URL.
// Absent execution stays unfiltered.
export const findingsSearchSchema = z
  .object({
    managedSystem: z.union([z.string().uuid(), z.literal('all')]).optional(),
    selected: z.string().uuid().optional(),
    execution: z.literal('none').optional(),
    returnTo: z.string().max(2048).optional(),
  })
  .strict();

type FindingsSearch = z.infer<typeof findingsSearchSchema>;

export function validateFindingsSearch(raw: unknown) {
  return parseRouteSearch(findingsSearchSchema, raw);
}

export const Route = createFileRoute('/_authed/findings/')({
  validateSearch: validateFindingsSearch,
  component: FindingsListPage,
});

export function FindingsListPage(): React.ReactElement {
  const search = useSearch({ strict: false }) as FindingsSearch;
  const navigate = useNavigate({ from: '/findings/' });
  const selectedId = search.selected ?? null;
  const managedSystemId = search.managedSystem === 'all' ? undefined : search.managedSystem;
  const execution = search.execution;

  const selectFinding = React.useCallback(
    (id: string): void => {
      void navigate({ to: '/findings', search: (prev) => ({ ...prev, selected: id }) });
    },
    [navigate],
  );

  // Stale/invalid `selected` (deleted, or filtered away): once the list has
  // settled (loaded, no refetch in flight), replace-drop it so Back is not trapped
  // in the invalid URL. While loading or refetching, or when the list failed, the
  // deep-linked selection is kept.
  const reconcileSelection = React.useCallback((): void => {
    void navigate({
      to: '/findings',
      replace: true,
      search: ({ selected: _selected, ...rest }) => rest,
    });
  }, [navigate]);

  const resetFilters = React.useCallback((): void => {
    void navigate({
      to: '/findings',
      search: ({ execution: _execution, ...rest }) => rest,
    });
  }, [navigate]);

  return (
    <FindingsListShell
      managedSystemId={managedSystemId}
      execution={execution}
      selectedId={selectedId}
      returnTo={search.returnTo}
      onSelect={selectFinding}
      onSelectionReconciled={reconcileSelection}
      onResetFilters={resetFilters}
    />
  );
}

function FindingsListShell({
  managedSystemId,
  execution,
  selectedId,
  returnTo,
  onSelect,
  onSelectionReconciled,
  onResetFilters,
}: {
  managedSystemId: string | undefined;
  execution: 'none' | undefined;
  selectedId: string | null;
  returnTo: string | undefined;
  onSelect: (id: string) => void;
  onSelectionReconciled: () => void;
  onResetFilters: () => void;
}): React.ReactElement {
  const navigate = useNavigate({ from: '/findings/' });
  const safeReturnTo = getSafeVocReturnTo(returnTo);
  const listQuery = useFindingsList(managedSystemId, execution);
  const findings = listQuery.data?.items ?? [];
  const checkUnfiltered = execution === 'none' && listQuery.isSuccess && findings.length === 0;
  const unfilteredQuery = useFindingsList(managedSystemId, undefined, checkUnfiltered);
  const stateError = listQuery.isError
    ? listQuery.error
    : checkUnfiltered && unfilteredQuery.isError
      ? unfilteredQuery.error
      : null;
  const stateIsError = listQuery.isError || (checkUnfiltered && unfilteredQuery.isError);
  const stateIsPending = listQuery.isPending || (checkUnfiltered && unfilteredQuery.isPending);
  const isFilteredEmpty =
    checkUnfiltered && unfilteredQuery.isSuccess && (unfilteredQuery.data?.items.length ?? 0) > 0;
  const retryList = React.useCallback((): void => {
    void (listQuery.isError ? listQuery.refetch() : unfilteredQuery.refetch());
  }, [listQuery.isError, listQuery.refetch, unfilteredQuery.refetch]);
  const { actors } = useWorkspaceActors();
  const actorsById = React.useMemo(() => {
    const map = new Map<string, AvatarUser>();
    for (const actor of actors ?? []) {
      map.set(actor.id, { display_name: actor.display_name });
    }
    return map;
  }, [actors]);

  React.useEffect(() => {
    if (!listQuery.isSuccess || listQuery.isFetching) return;
    if (selectedId !== null && !findings.some((finding) => finding.id === selectedId)) {
      onSelectionReconciled();
    }
  }, [findings, listQuery.isFetching, listQuery.isSuccess, onSelectionReconciled, selectedId]);

  return (
    <ListShell
      toolbar={{
        title: 'Findings',
        subtitle: 'VOC evidence에서 실행 후보로 승격된 Finding을 검토합니다.',
      }}
      list={
        <FindingsListBody
          findings={findings}
          isPending={stateIsPending}
          isError={stateIsError}
          isSuccess={listQuery.isSuccess}
          error={stateError}
          isFilteredEmpty={isFilteredEmpty}
          selectedId={selectedId}
          actorsById={actorsById}
          onSelect={onSelect}
          onRetry={retryList}
          onResetFilters={onResetFilters}
        />
      }
      detailPanel={
        stateIsError && isPermissionDenied(stateError) ? null : selectedId ? (
          <div className="flex h-full min-h-0 flex-col">
            {safeReturnTo !== null && (
              <div className="flex h-10 shrink-0 items-center border-b border-border-subtle px-4">
                <a
                  href={safeReturnTo}
                  onClick={(event) => {
                    if (
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey ||
                      event.button !== 0
                    ) {
                      return;
                    }
                    event.preventDefault();
                    void navigate({ href: safeReturnTo });
                  }}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-sm text-text-muted hover:bg-surface-card hover:text-text-primary"
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                  <span>원래 VOC로 돌아가기</span>
                </a>
              </div>
            )}
            <div className="min-h-0 flex-1">
              <FindingDetailPanel findingId={selectedId} />
            </div>
          </div>
        ) : (
          <FindingEmptyDetail />
        )
      }
    />
  );
}

function getSafeVocReturnTo(value: string | undefined): string | null {
  if (value === undefined || !value.startsWith('/vocs')) return null;

  try {
    const url = new URL(value, 'http://feedbackops.local');
    if (url.origin !== 'http://feedbackops.local' || url.pathname !== '/vocs' || url.hash) {
      return null;
    }

    const searchEntries = [...url.searchParams.entries()];
    if (new Set(searchEntries.map(([key]) => key)).size !== searchEntries.length) return null;
    if (!vocSearchSchema.safeParse(Object.fromEntries(searchEntries)).success) return null;

    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function FindingsListBody({
  findings,
  isPending,
  isError,
  isSuccess,
  error,
  isFilteredEmpty,
  selectedId,
  actorsById,
  onSelect,
  onRetry,
  onResetFilters,
}: {
  findings: FindingDto[];
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: unknown;
  isFilteredEmpty: boolean;
  selectedId: string | null;
  actorsById: Map<string, AvatarUser>;
  onSelect: (id: string) => void;
  onRetry: () => void;
  onResetFilters: () => void;
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
          reason={PERMISSION_BLOCKED_REASONS.findingsList}
          className="m-4"
        />
      ) : isError ? (
        <div data-testid="finding-list-error" className="p-4">
          <ListStateMessage
            variant="error"
            title="Finding 목록을 불러오지 못했습니다"
            body="잠시 후 다시 시도하세요."
            action={{ label: '다시 시도', onClick: onRetry }}
          />
        </div>
      ) : isFilteredEmpty ? (
        <div className="p-4" data-testid="finding-filtered-empty-state">
          <ListStateMessage
            variant="filtered"
            title="현재 조건에 맞는 Finding이 없습니다"
            body="실행과 연결되지 않은 Finding만 표시 중입니다."
            action={{ label: '필터 초기화', onClick: onResetFilters }}
          />
        </div>
      ) : findings.length === 0 ? (
        <div className="p-4" data-testid="finding-empty-state">
          <ListStateMessage
            variant="empty"
            title="생성된 Finding이 없습니다."
            body="VOC 근거에서 실행 후보로 승격된 Finding이 여기에 표시됩니다."
          />
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
          <span>{FINDING_SEVERITY_LABELS[finding.severity]}</span>
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
      {FINDING_STATUS_LABELS[status]}
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
      신뢰도 · {FINDING_CONFIDENCE_LABELS[confidence]}
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
