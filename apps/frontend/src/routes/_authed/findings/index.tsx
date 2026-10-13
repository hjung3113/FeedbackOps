import { fetchEntityLinksBySource } from '@/lib/api/entity-links';
import { useQuery } from '@tanstack/react-query';
// /findings — ADR-0020 ListShell finding list + right detail panel.

import { ListLoadMore } from '@/components/ListLoadMore';
import { ListStateMessage } from '@/components/ListStateMessage';
import { FindingDetailPanel } from '@/features/findings/components/FindingDetail';
import { useFindingDetail } from '@/features/findings/hooks/useFindingDetail';
import { useFindingsPages, useFindingsTotal } from '@/features/findings/hooks/useFindingsList';
import { resolveActors } from '@/lib/api/actors';
import { ApiError, isPermissionDenied } from '@/lib/api/types';
import {
  FINDING_CONFIDENCE_LABELS,
  FINDING_SEVERITY_LABELS,
  FINDING_STATUS_LABELS,
} from '@/lib/copy/enum-labels';
import { FINDING_RESPONSIBILITY_COPY as OWNER_COPY } from '@/lib/copy/finding-responsibility';
import { GLOSSARY } from '@/lib/copy/glossary';
import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import { formatCount } from '@/lib/format/count';
import { formatShortDate } from '@/lib/format/datetime';
import { InternalLink } from '@/lib/router/InternalLink';
import { parseRouteSearch } from '@/lib/router/search';
import type { FindingDto } from '@fops/shared';
import {
  type AvatarUser,
  ListShell,
  ObjectRow,
  OutlineBadge,
  PermissionBlockedPanel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SkeletonRows,
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
    assignment: z.enum(['assigned', 'unassigned']).optional(),
    returnTo: z.string().max(2048).optional(),
  })
  .strict();

type FindingsSearch = z.infer<typeof findingsSearchSchema>;

export function validateFindingsSearch(raw: unknown) {
  return parseRouteSearch(findingsSearchSchema, raw);
}

// #982: the router plugin skips code-splitting when the route component is an
// exported local (hasExport check). The alias keeps FindingsListPage exported
// for tests while letting the route component split into its own chunk.
const FindingsListPageSplit = FindingsListPage;

export const Route = createFileRoute('/_authed/findings/')({
  validateSearch: validateFindingsSearch,
  component: FindingsListPageSplit,
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
      search: ({ execution: _execution, assignment: _assignment, ...rest }) => rest,
    });
  }, [navigate]);

  return (
    <FindingsListShell
      managedSystemId={managedSystemId}
      execution={execution}
      assignment={search.assignment}
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
  assignment,
  selectedId,
  returnTo,
  onSelect,
  onSelectionReconciled,
  onResetFilters,
}: {
  managedSystemId: string | undefined;
  execution: 'none' | undefined;
  assignment: 'assigned' | 'unassigned' | undefined;
  selectedId: string | null;
  returnTo: string | undefined;
  onSelect: (id: string) => void;
  onSelectionReconciled: () => void;
  onResetFilters: () => void;
}): React.ReactElement {
  const navigate = useNavigate({ from: '/findings/' });
  const safeReturnTo = getSafeVocReturnTo(returnTo);
  const listQuery = useFindingsPages(managedSystemId, execution, assignment);
  const findings = React.useMemo(
    () => listQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [listQuery.data],
  );
  const total = listQuery.data?.pages[0]?.page?.total;
  const selectedQuery = useFindingDetail(selectedId);
  const selectedLinks = useQuery({
    queryKey: ['entity-links', 'finding', selectedId, 'requested_task'],
    queryFn: ({ signal }) => fetchEntityLinksBySource('finding', selectedId as string, { signal }),
    enabled:
      execution === 'none' &&
      selectedId !== null &&
      selectedQuery.isSuccess &&
      !findings.some((item) => item.id === selectedId),
  });
  const checkUnfiltered =
    (execution === 'none' || assignment !== undefined) &&
    listQuery.isSuccess &&
    findings.length === 0;
  const unfilteredQuery = useFindingsTotal(managedSystemId, checkUnfiltered);
  const stateError =
    listQuery.isError && !listQuery.isFetchNextPageError
      ? listQuery.error
      : checkUnfiltered && unfilteredQuery.isError
        ? unfilteredQuery.error
        : null;
  const stateIsError =
    (listQuery.isError && !listQuery.isFetchNextPageError) ||
    (checkUnfiltered && unfilteredQuery.isError);
  const stateIsPending = listQuery.isPending || (checkUnfiltered && unfilteredQuery.isPending);
  const isFilteredEmpty =
    checkUnfiltered && unfilteredQuery.isSuccess && (unfilteredQuery.data?.page?.total ?? 0) > 0;
  const retryList = React.useCallback((): void => {
    void (listQuery.isError && !listQuery.isFetchNextPageError
      ? listQuery.refetch()
      : unfilteredQuery.refetch());
  }, [
    listQuery.isError,
    listQuery.isFetchNextPageError,
    listQuery.refetch,
    unfilteredQuery.refetch,
  ]);
  const { actors } = useWorkspaceActors();
  const actorsById = React.useMemo(() => {
    const map = new Map<string, AvatarUser>();
    for (const actor of actors ?? []) {
      map.set(actor.id, { display_name: actor.display_name });
    }
    return map;
  }, [actors]);
  // Team owners resolve by name for the visible page (same source as the
  // detail panel's owner field); `팀 · <short id>` stays the fallback while
  // unresolved.
  const teamIds = React.useMemo(
    () => [
      ...new Set(
        findings.map((finding) => finding.owner_team_id).filter((id): id is string => id !== null),
      ),
    ],
    [findings],
  );
  const teamsQuery = useQuery({
    queryKey: ['actors-resolve', [], teamIds],
    enabled: teamIds.length > 0,
    queryFn: ({ signal }) => resolveActors({ teamIds }, signal),
    retry: false,
  });
  const teamNamesById = React.useMemo(
    () => new Map((teamsQuery.data?.teams ?? []).map((team) => [team.id, team.name])),
    [teamsQuery.data],
  );

  React.useEffect(() => {
    if (!listQuery.isSuccess || listQuery.isFetching || selectedId === null) return;
    const item = selectedQuery.data;
    const filteredOut =
      item !== undefined &&
      ((managedSystemId !== undefined && item.primary_managed_system_id !== managedSystemId) ||
        (assignment === 'unassigned' &&
          (item.owner_actor_id !== null || item.owner_team_id !== null)) ||
        (assignment === 'assigned' &&
          item.owner_actor_id === null &&
          item.owner_team_id === null) ||
        (execution === 'none' &&
          (item.status !== 'active' ||
            item.linked_task_id !== null ||
            selectedLinks.data?.items.some(
              (link) =>
                link.source_type === 'finding' &&
                'source_id' in link &&
                link.source_id === item.id &&
                link.target_type === 'task_request' &&
                link.relation_type === 'requested_task' &&
                link.status === 'active',
            ))));
    if (
      (selectedQuery.error instanceof ApiError && selectedQuery.error.status === 404) ||
      filteredOut
    )
      onSelectionReconciled();
  }, [
    listQuery.isSuccess,
    listQuery.isFetching,
    selectedId,
    selectedQuery.data,
    selectedQuery.error,
    selectedLinks.data,
    managedSystemId,
    execution,
    assignment,
    onSelectionReconciled,
  ]);

  return (
    <ListShell
      toolbar={{
        title: 'Findings',
        subtitle: 'VOC Evidence에서 실행 후보로 승격된 Finding을 검토합니다.',
      }}
      tabs={
        <div className="px-5 py-2">
          <Select
            value={assignment ?? 'all'}
            onValueChange={(value) => {
              void navigate({
                to: '/findings',
                search: ({ assignment: _assignment, ...rest }) =>
                  value === 'all'
                    ? rest
                    : { ...rest, assignment: value as 'assigned' | 'unassigned' },
              });
            }}
          >
            <SelectTrigger density="compact" className="w-fit" aria-label={OWNER_COPY.filter}>
              <span className="mr-1 text-text-muted">{GLOSSARY.owner}:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{OWNER_COPY.all}</SelectItem>
              <SelectItem value="assigned">{OWNER_COPY.assigned}</SelectItem>
              <SelectItem value="unassigned">{OWNER_COPY.unassigned}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      }
      list={
        <>
          <FindingsListBody
            findings={findings}
            total={total}
            isPending={stateIsPending}
            isError={stateIsError}
            isSuccess={listQuery.isSuccess || listQuery.isFetchNextPageError}
            error={stateError}
            isFilteredEmpty={isFilteredEmpty}
            assignmentFiltered={assignment !== undefined}
            selectedId={selectedId}
            actorsById={actorsById}
            teamNamesById={teamNamesById}
            onSelect={onSelect}
            onRetry={retryList}
            onResetFilters={onResetFilters}
          />
          <ListLoadMore
            hasMore={listQuery.hasNextPage}
            loadingMore={listQuery.isFetchingNextPage}
            failed={listQuery.isFetchNextPageError}
            onLoadMore={() => void listQuery.fetchNextPage()}
          />
        </>
      }
      detailPanel={
        stateIsError && isPermissionDenied(stateError) ? null : selectedId ? (
          <FindingDetailPanel
            findingId={selectedId}
            {...(safeReturnTo !== null
              ? {
                  headerExtras: (
                    <InternalLink
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
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-text-muted hover:bg-surface-canvas hover:text-text-primary"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                      <span>원래 VOC로 돌아가기</span>
                    </InternalLink>
                  ),
                }
              : {})}
          />
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
  total,
  isPending,
  isError,
  isSuccess,
  error,
  isFilteredEmpty,
  assignmentFiltered,
  selectedId,
  actorsById,
  teamNamesById,
  onSelect,
  onRetry,
  onResetFilters,
}: {
  findings: FindingDto[];
  total: number | undefined;
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: unknown;
  isFilteredEmpty: boolean;
  assignmentFiltered: boolean;
  selectedId: string | null;
  actorsById: Map<string, AvatarUser>;
  teamNamesById: Map<string, string>;
  onSelect: (id: string) => void;
  onRetry: () => void;
  onResetFilters: () => void;
}): React.ReactElement {
  const isReadDenied = isError && isPermissionDenied(error);

  return (
    <section className="flex min-h-full flex-col">
      {!isReadDenied ? (
        <div className="border-b border-border-subtle px-5 py-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Finding 목록
            </h3>
            {isSuccess && total !== undefined ? (
              <span className="text-xs text-text-muted">{formatCount(total as number)}</span>
            ) : null}
          </div>
        </div>
      ) : null}

      {isPending ? (
        <div className="space-y-2 p-4" data-testid="finding-list-skeleton">
          <SkeletonRows count={3} size="compact" />
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
            body={
              assignmentFiltered
                ? OWNER_COPY.filteredEmpty
                : '실행과 연결되지 않은 Finding만 표시 중입니다.'
            }
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
              owner={
                finding.owner_actor_id ? (actorsById.get(finding.owner_actor_id) ?? null) : null
              }
              teamName={
                finding.owner_team_id ? (teamNamesById.get(finding.owner_team_id) ?? null) : null
              }
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
  teamName,
  onClick,
}: {
  finding: FindingDto;
  selected: boolean;
  owner: AvatarUser | null;
  teamName: string | null;
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
          <span>
            {GLOSSARY.owner}:{' '}
            {finding.owner_actor_id
              ? (owner?.display_name ?? GLOSSARY.unknownUser)
              : finding.owner_team_id
                ? (teamName ?? `${OWNER_COPY.team} · ${finding.owner_team_id.slice(0, 8)}`)
                : GLOSSARY.unassigned}
          </span>
          {dot()}
          <span>{formatShortDate(finding.created_at)}</span>
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
