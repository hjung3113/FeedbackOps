import { ListStateMessage } from '@/components/ListStateMessage';
import { ApiError } from '@/lib/api';
import { useMe } from '@/lib/auth/useMe';
import { EVIDENCE_SOURCE_TYPE_LABELS } from '@/lib/copy/enum-labels';
import { EVIDENCE_COPY as COPY } from '@/lib/copy/evidence';
import { GLOSSARY } from '@/lib/copy/glossary';
import type { EvidenceInventoryItem, ListEvidenceInventoryResponse } from '@fops/shared';
import {
  Button,
  ListShell,
  ListToolbar,
  PermissionBlockedPanel,
  SearchInput,
  Skeleton,
} from '@fops/ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  type EvidenceFilters,
  evidenceInventoryQueryKey,
  fetchEvidenceDetail,
  fetchEvidenceInventory,
} from '../api/evidence-inventory';
import { EvidencePanel } from '../components/EvidencePanel';
import { EvidenceRow } from '../components/EvidenceRow';

type Search = {
  managedSystem?: string | undefined;
  source?: EvidenceFilters['source'] | undefined;
  q?: string | undefined;
  cursor?: string | undefined;
  selected?: string | undefined;
};
function matches(item: EvidenceInventoryItem, search: Search) {
  if (
    search.managedSystem &&
    search.managedSystem !== 'all' &&
    search.managedSystem !== item.primary_managed_system_id
  )
    return false;
  if (search.source && search.source !== item.source_type) return false;
  const labels = [item.finding.title, item.finding.display_id];
  if (item.content_state === 'available') labels.push(item.quote_or_summary ?? '');
  if (item.source_type === 'voc' && item.source)
    labels.push(item.source.title, item.source.display_id);
  if (item.source_type === 'survey_response' && item.source)
    labels.push(item.source.survey_type, item.source.survey_display_id, item.source.question_label);
  return labels.some((label) =>
    label.toLowerCase().includes((search.q ?? '').trim().toLowerCase()),
  );
}
function denied(error: unknown) {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

export function EvidenceRoute() {
  const search = useSearch({ strict: false }) as Search;
  const me = useMe();
  const context = JSON.stringify([search.managedSystem, search.source, search.q]);
  if (!me.isSuccess || me.isError)
    return (
      <ListShell
        list={
          me.isError ? (
            <PermissionBlockedPanel state="denied" category="Evidence" description={COPY.blocked} />
          ) : (
            <Skeleton className="h-32" role="status" aria-label={COPY.loading} />
          )
        }
      />
    );
  const viewer = `${me.data.workspace_id}:${me.data.actor.id}:${me.data.actor.role_level}:${me.dataUpdatedAt}`;
  return <EvidenceSession key={`${viewer}:${context}`} search={search} viewer={viewer} />;
}

function EvidenceSession({ search, viewer }: { search: Search; viewer: string }) {
  const navigate = useNavigate({ from: '/integration/evidence' });
  const [draft, setDraft] = useState(search.q ?? '');
  const [refresh, setRefresh] = useState(0);
  const [manualRefresh, setManualRefresh] = useState(false);
  const [pages, setPages] = useState<{
    refresh: number;
    root: string;
    entries: Map<
      string,
      { response: ListEvidenceInventoryResponse; items: EvidenceInventoryItem[] }
    >;
  }>({ refresh, root: search.cursor ?? '', entries: new Map() });
  const [withdrawn, setWithdrawn] = useState(
    new Map<string, { item: EvidenceInventoryItem | 'gone'; updatedAt: number }>(),
  );
  const rows = useRef(new Map<string, HTMLDivElement>());
  const origin = useRef<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const list = useQuery({
    queryKey: [
      ...evidenceInventoryQueryKey(),
      viewer,
      refresh,
      'list',
      search.managedSystem,
      search.source,
      search.q,
      search.cursor,
    ],
    queryFn: ({ signal }) =>
      fetchEvidenceInventory(
        {
          ...(search.managedSystem ? { managedSystem: search.managedSystem } : {}),
          ...(search.source ? { source: search.source } : {}),
          ...(search.q ? { q: search.q } : {}),
          ...(search.cursor !== undefined ? { cursor: search.cursor } : {}),
        },
        signal,
      ),
    retry: false,
    gcTime: 0,
    staleTime: 0,
  });
  const detail = useQuery({
    queryKey: [
      ...evidenceInventoryQueryKey(),
      viewer,
      refresh,
      'detail',
      search.managedSystem,
      search.source,
      search.q,
      search.cursor,
      search.selected,
    ],
    queryFn: ({ signal }) => fetchEvidenceDetail(search.selected as string, signal),
    enabled: Boolean(search.selected),
    retry: false,
    gcTime: 0,
    staleTime: 0,
  });
  const [wasFetching, setWasFetching] = useState(false);
  if (wasFetching !== list.isFetching) {
    setWasFetching(list.isFetching);
    if (list.isFetching && list.data && !manualRefresh)
      setPages({ refresh, root: search.cursor ?? '', entries: new Map() });
  }
  const pageKey = search.cursor ?? '';
  // Keep successful earlier pages for a load-more retry. No previous session/scope
  // state survives the keyed session, and failed reauthorization hides all content.
  if (pages.refresh !== refresh && !manualRefresh)
    setPages({ refresh, root: pageKey, entries: new Map() });
  else if (
    list.isSuccess &&
    !list.isFetching &&
    pages.entries.get(pageKey)?.response !== list.data
  ) {
    const entries = pages.refresh === refresh ? new Map(pages.entries) : new Map();
    entries.set(pageKey, { response: list.data, items: list.data.items });
    setPages({ refresh, root: pages.refresh === refresh ? pages.root : pageKey, entries });
  }
  // Withdrawal outlives selection and page responses, but resets with this keyed
  // session/scope. Only a newer successful detail read may restore available text.
  if (search.selected && !detail.isFetching) {
    const previous = withdrawn.get(search.selected);
    const unreadable =
      denied(detail.error) || (detail.error instanceof ApiError && detail.error.status === 404);
    const updatedAt = detail.isError ? detail.errorUpdatedAt : detail.dataUpdatedAt;
    if (updatedAt > (previous?.updatedAt ?? 0)) {
      const item = unreadable ? 'gone' : detail.isSuccess ? detail.data : undefined;
      if (item === 'gone' || item?.content_state === 'withheld') {
        const entries = new Map(withdrawn);
        entries.set(search.selected, { item, updatedAt });
        setWithdrawn(entries);
      } else if (previous && item?.content_state === 'available') {
        const entries = new Map(withdrawn);
        entries.delete(search.selected);
        setWithdrawn(entries);
      }
    }
  }
  useEffect(() => {
    const error = list.error;
    const fields = error instanceof ApiError ? error.detail?.fields : undefined;
    if (
      pages.entries.size === 0 &&
      search.cursor !== undefined &&
      error instanceof ApiError &&
      error.status === 422 &&
      Array.isArray(fields) &&
      fields.some(
        (field) =>
          field?.code === 'invalid_cursor' &&
          Array.isArray(field.path) &&
          field.path.length === 1 &&
          field.path[0] === 'cursor',
      )
    ) {
      void navigate({ search: (previous) => ({ ...previous, cursor: undefined }), replace: true });
    }
  }, [list.error, navigate, pages.entries.size, search.cursor]);
  useEffect(() => {
    if (manualRefresh && !list.isPending && !list.isFetching && !detail.isFetching)
      setManualRefresh(false);
  }, [manualRefresh, list.isPending, list.isFetching, detail.isFetching]);
  const blocked = denied(list.error) || denied(detail.error);
  useEffect(() => {
    if (!blocked) return;
    setDraft('');
    rows.current.clear();
    origin.current = null;
  }, [blocked]);
  const visiblePages: {
    response: ListEvidenceInventoryResponse;
    items: EvidenceInventoryItem[];
  }[] = [];
  const visited = new Set<string>();
  // Keep the loaded chain's root as load more advances the URL; a loaded first
  // page takes precedence. The root shares the existing page-cache lifetime.
  let cursor: string | undefined = pages.entries.has('') ? '' : pages.root;
  while (cursor !== undefined && !visited.has(cursor)) {
    const page = pages.entries.get(cursor);
    if (!page) break;
    visited.add(cursor);
    visiblePages.push(page);
    if (cursor === pageKey) break;
    cursor = page.response.page.cursor;
  }
  const lastPage = visiblePages.at(-1)?.response.page;
  const items =
    blocked || (pages.refresh !== refresh && !manualRefresh)
      ? []
      : [
          ...new Map(
            visiblePages
              .flatMap((page) =>
                page.items.flatMap((item) => {
                  const replacement = withdrawn.get(item.id)?.item;
                  return replacement === 'gone' ? [] : [replacement ?? item];
                }),
              )
              .map((item) => [item.id, item]),
          ).values(),
        ];
  const filtered = Boolean(search.source || search.q);
  function changeFilter(next: Search) {
    void navigate({ search: { ...next, cursor: undefined } });
  }
  async function close() {
    await navigate({ search: (prev) => ({ ...prev, selected: undefined }), replace: true });
    const row = origin.current ? rows.current.get(origin.current) : undefined;
    (row ?? searchRef.current?.querySelector<HTMLInputElement>('input'))?.focus();
    origin.current = null;
  }
  const safeDetail = !blocked && !detail.isFetching && !detail.isError ? detail.data : undefined;
  return (
    <ListShell
      detailPanel={
        search.selected ? (
          <EvidencePanel
            item={safeDetail}
            loading={!blocked && (detail.isPending || detail.isFetching)}
            error={blocked ? (list.error ?? detail.error) : detail.error}
            mismatch={Boolean(safeDetail && !matches(safeDetail, search))}
            onClose={() => void close()}
            onRetry={() => void detail.refetch()}
          />
        ) : undefined
      }
      list={
        <>
          <ListToolbar
            title={COPY.title}
            tabs={[
              { value: 'all', label: GLOSSARY.all, disabled: blocked },
              ...Object.entries(EVIDENCE_SOURCE_TYPE_LABELS).map(([value, label]) => ({
                value,
                label,
                disabled: blocked,
              })),
            ]}
            tabsAriaLabel={COPY.sourceTabs}
            activeTab={search.source ?? 'all'}
            onTabChange={(value) =>
              changeFilter({
                ...search,
                source: value === 'all' ? undefined : (value as Search['source']),
              })
            }
            action={
              <fieldset disabled={blocked} className="flex items-center gap-2">
                <div ref={searchRef}>
                  <SearchInput
                    placeholder={COPY.search}
                    value={draft}
                    onValueChange={setDraft}
                    onCommit={() => {
                      if (blocked) return;
                      const q = draft.trim().slice(0, 200);
                      if (q !== (search.q ?? '')) changeFilter({ ...search, q: q || undefined });
                    }}
                  />
                </div>
                <Button
                  variant="subtle"
                  size="sm"
                  spacing="compact"
                  disabled={manualRefresh}
                  onClick={() => {
                    setManualRefresh(true);
                    setRefresh((value) => value + 1);
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  {GLOSSARY.refresh}
                </Button>
              </fieldset>
            }
          />
          <p className="border-b border-border-subtle px-5 py-3 text-xs text-text-muted">
            {COPY.description}
          </p>
          {!blocked && search.cursor && !pages.entries.has('') && items.length > 0 && (
            <div className="px-5 py-2">
              <Button
                variant="subtle"
                size="sm"
                spacing="compact"
                onClick={() =>
                  void navigate({ search: (previous) => ({ ...previous, cursor: undefined }) })
                }
              >
                {COPY.startOver}
              </Button>
            </div>
          )}
          {blocked ? (
            <PermissionBlockedPanel state="denied" category="Evidence" description={COPY.blocked} />
          ) : (list.isPending || list.isFetching) && items.length === 0 ? (
            <Skeleton className="h-32" role="status" aria-label={COPY.loading} />
          ) : list.isError && items.length === 0 ? (
            <ListStateMessage
              variant="error"
              title={COPY.error}
              action={{ label: COPY.retry, onClick: () => void list.refetch() }}
            />
          ) : items.length === 0 ? (
            <ListStateMessage
              variant={filtered ? 'filtered' : 'empty'}
              title={filtered ? COPY.filteredEmpty : COPY.empty}
              {...(filtered
                ? {
                    action: {
                      label: COPY.clear,
                      onClick: () =>
                        changeFilter({
                          managedSystem: search.managedSystem,
                          selected: search.selected,
                        }),
                    },
                  }
                : {})}
            />
          ) : (
            items
              .filter(
                (item) =>
                  !(
                    item.id === search.selected &&
                    detail.error instanceof ApiError &&
                    detail.error.status === 404
                  ),
              )
              .map((item) => (
                <EvidenceRow
                  key={item.id}
                  item={item.id === search.selected && safeDetail ? safeDetail : item}
                  loading={
                    !manualRefresh &&
                    item.id === search.selected &&
                    (detail.isPending || detail.isFetching || detail.isError)
                  }
                  rowRef={(node) => {
                    if (node) rows.current.set(item.id, node);
                    else rows.current.delete(item.id);
                  }}
                  selected={search.selected === item.id}
                  onSelect={() => {
                    origin.current = item.id;
                    void navigate({ search: (prev) => ({ ...prev, selected: item.id }) });
                  }}
                />
              ))
          )}
          {!blocked && items.length > 0 && list.isError && (
            <ListStateMessage
              variant="error"
              title={COPY.moreError}
              action={{ label: COPY.retry, onClick: () => void list.refetch() }}
            />
          )}
          {!blocked && items.length > 0 && !list.isError && lastPage?.has_more && (
            <div className="p-4">
              <Button
                variant="subtle"
                size="sm"
                disabled={list.isFetching}
                onClick={() =>
                  void navigate({ search: (prev) => ({ ...prev, cursor: lastPage?.cursor }) })
                }
              >
                {COPY.more}
              </Button>
            </div>
          )}
        </>
      }
    />
  );
}
