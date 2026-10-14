import { ListLoadMore } from '@/components/ListLoadMore';
import { ListStateMessage } from '@/components/ListStateMessage';
import { ApiError, fetchRecoveryDetail, fetchRecoveryHistory, fetchRecoveryItems } from '@/lib/api';
import { useMe } from '@/lib/auth/useMe';
import { HOME_QUEUE_COPY } from '@/lib/copy/home';
import { RECOVERY_COPY as COPY } from '@/lib/copy/recovery';
import { RECOVERY_QUERY_KEY, invalidateRecovery } from '@/lib/query/recovery';
import { InternalLink } from '@/lib/router/InternalLink';
import { type RecoverySearch, safeRecoveryReturnTo } from '@/lib/router/recovery-search';
import { type DashboardSummary, RECOVERY_CATEGORIES, type RecoveryCategory } from '@fops/shared';
import {
  Button,
  ListToolbar,
  ObjectRow,
  PermissionBlockedPanel,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@fops/ui';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useEffect, useRef } from 'react';
import { RecoveryFreshness, formatRecoveryTime } from './RecoveryFreshness';
import { RecoveryPanel, type RenderRecoveryAccess } from './RecoveryPanel';

/** Integration's supported composition seam: caller's existing PageShell owns the slot. */
export function useRecoveryQueue(
  view: 'operational' | 'actionable',
  active = true,
  renderRequestAccess?: RenderRecoveryAccess,
) {
  const me = useMe();
  const client = useQueryClient();
  const search = useSearch({ strict: false }) as RecoverySearch;
  const location = useLocation();
  const navigate = useNavigate();
  const actor = me.data?.actor.id;
  const workspace = me.data?.workspace_id;
  const enabled = active && actor !== undefined && workspace !== undefined;
  const context = JSON.stringify([
    view,
    search.category,
    search.managedSystem,
    search.presentation,
    search.history,
    actor,
    workspace,
  ]);
  const contextRef = useRef(context);
  const origin = useRef<{ id: string; context: string; node: HTMLElement } | undefined>(undefined);
  const rows = useRef(new Map<string, HTMLElement>());
  const heading = useRef<HTMLHeadingElement>(null);
  const focusFrame = useRef<number | undefined>(undefined);
  const pendingFocus = useRef<(() => void) | undefined>(undefined);
  const cancelFocus = useCallback(() => {
    if (focusFrame.current !== undefined) cancelAnimationFrame(focusFrame.current);
    focusFrame.current = undefined;
    pendingFocus.current = undefined;
  }, []);
  const update = useCallback(
    (values: Record<string, unknown>, reset = false) => {
      cancelFocus();
      void navigate({
        to: location.pathname,
        search: (previous: Record<string, unknown>) => ({
          ...previous,
          ...(reset ? { cursor: undefined } : {}),
          ...values,
        }),
      });
    },
    [cancelFocus, navigate, location.pathname],
  );
  useEffect(() => {
    if (contextRef.current !== context) {
      contextRef.current = context;
      origin.current = undefined;
      cancelFocus();
    }
  }, [context, cancelFocus]);
  useEffect(() => cancelFocus, [cancelFocus]);
  useEffect(() => {
    if (search.selected) cancelFocus();
  }, [search.selected, cancelFocus]);
  useEffect(() => {
    if (!active) cancelFocus();
  }, [active, cancelFocus]);
  const common = {
    ...(search.category ? { category: search.category } : {}),
    ...(search.managedSystem ? { managed_system_id: search.managedSystem } : {}),
    limit: 50,
  };
  const list = useInfiniteQuery({
    queryKey: [
      ...RECOVERY_QUERY_KEY,
      'list',
      workspace,
      actor,
      view,
      search.category,
      search.managedSystem,
      search.presentation,
      search.cursor,
    ],
    queryFn: ({ signal, pageParam }) =>
      fetchRecoveryItems(
        {
          ...common,
          view,
          presentation: search.presentation ?? 'visible',
          ...(pageParam ? { cursor: pageParam } : {}),
        },
        signal,
      ),
    initialPageParam: search.cursor,
    getNextPageParam: (page) => (page.page.has_more ? page.page.cursor : undefined),
    enabled: enabled && !search.history,
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const history = useInfiniteQuery({
    queryKey: [
      ...RECOVERY_QUERY_KEY,
      'history',
      workspace,
      actor,
      search.category,
      search.managedSystem,
      search.cursor,
    ],
    queryFn: ({ signal, pageParam }) =>
      fetchRecoveryHistory({ ...common, ...(pageParam ? { cursor: pageParam } : {}) }, signal),
    initialPageParam: search.cursor,
    getNextPageParam: (page) => (page.page.has_more ? page.page.cursor : undefined),
    enabled: enabled && !!search.history,
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const detail = useQuery({
    queryKey: [
      ...RECOVERY_QUERY_KEY,
      'detail',
      workspace,
      actor,
      search.selected,
      search.managedSystem,
    ],
    queryFn: ({ signal }) => fetchRecoveryDetail(search.selected as string, signal),
    enabled: enabled && !!search.selected,
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const pageSummary = useQuery<DashboardSummary>({
    queryKey: [
      'dashboard-summary',
      search.managedSystem === 'all' ? undefined : search.managedSystem,
    ],
    enabled: false,
  });
  const current = search.history ? history : list;
  const cursorError =
    current.error instanceof ApiError && current.error.code === 'validation.failed';
  useEffect(() => {
    if (cursorError && search.cursor)
      void navigate({
        to: location.pathname,
        replace: true,
        search: (previous: Record<string, unknown>) => ({ ...previous, cursor: undefined }),
      });
  }, [cursorError, search.cursor, navigate, location.pathname]);
  const close = useCallback(() => {
    const id = search.selected;
    update({ selected: undefined });
    let frames = 0;
    function focus() {
      const captured = origin.current;
      const row =
        captured && captured.id === id && captured.context === context
          ? captured.node
          : id
            ? rows.current.get(id)
            : undefined;
      const target = row?.isConnected ? row : heading.current;
      if (!target?.isConnected) return;
      if (target.closest('[hidden]')) {
        if (++frames < 10) focusFrame.current = requestAnimationFrame(focus);
        return;
      }
      target.focus();
      focusFrame.current = undefined;
    }
    // Focus after the selection has cleared and the panel unmounted, so nothing restores focus later.
    pendingFocus.current = focus;
  }, [search.selected, context, update]);
  useEffect(() => {
    const run = pendingFocus.current;
    if (search.selected || !run) return;
    pendingFocus.current = undefined;
    focusFrame.current = requestAnimationFrame(run);
  }, [search.selected]);
  const selected = search.selected;
  const first = current.data?.pages[0];
  const denied = current.error instanceof ApiError && [401, 403].includes(current.error.status);
  const items = search.history
    ? history.data?.pages.flatMap((page) =>
        page.items.map((row) => ({
          key: row.id,
          item: row.item,
          episode: `${COPY.occurrence(row.occurrence)} · ${COPY.state[row.resolution.outcome]}`,
          resolution: row.resolution.resolved_at,
        })),
      )
    : list.data?.pages.flatMap((page) =>
        page.items.map((item) => ({
          key: item.recovery_item_id,
          item,
          episode: '',
          resolution: '',
        })),
      );
  useEffect(() => {
    if (active && selected && current.data)
      rows.current.get(selected)?.scrollIntoView({ block: 'nearest' });
  }, [active, selected, current.data]);
  const queue = (
    <section className="mt-9" data-testid="recovery-queue">
      <h2 ref={heading} tabIndex={-1} className="mb-3 text-sm font-semibold">
        {view === 'actionable' ? COPY.actionable : COPY.title}
      </h2>
      <ListToolbar
        tabs={[
          { value: 'visible', label: COPY.visible },
          { value: 'hidden', label: COPY.hidden },
          { value: 'history', label: COPY.history },
        ]}
        activeTab={search.history ? 'history' : (search.presentation ?? 'visible')}
        tabsAriaLabel={COPY.title}
        onTabChange={(tab) =>
          update(
            {
              history: tab === 'history' ? true : undefined,
              presentation: tab === 'hidden' ? 'hidden' : undefined,
            },
            true,
          )
        }
        action={
          <Button variant="subtle" size="sm" onClick={() => void invalidateRecovery(client)}>
            {COPY.refresh}
          </Button>
        }
      />
      <div className="my-3 flex flex-wrap items-center gap-3">
        <Select
          value={search.category ?? 'all'}
          onValueChange={(value) =>
            update({ category: value === 'all' ? undefined : (value as RecoveryCategory) }, true)
          }
        >
          <SelectTrigger aria-label={COPY.category} className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">{COPY.all}</SelectItem>
              {RECOVERY_CATEGORIES.map((category) => (
                <SelectItem key={category} value={category}>
                  {HOME_QUEUE_COPY[category].title}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {search.history ? (
          <p className="text-xs text-text-muted">
            {COPY.historyWindow} · {history.data?.pages[0]?.total ?? '—'}건
          </p>
        ) : (
          list.data && (
            <p className="text-xs text-text-muted">
              {COPY.totals(
                list.data.pages[0]?.visible_total ?? 0,
                list.data.pages[0]?.hidden_total ?? 0,
              )}
            </p>
          )
        )}
        {safeRecoveryReturnTo(search.returnTo) && (
          <InternalLink href={search.returnTo as string}>{COPY.returnQueue}</InternalLink>
        )}
      </div>
      <RecoveryFreshness
        computedAt={first?.computed_at}
        failed={current.isError}
        updatedAt={current.dataUpdatedAt}
        pageComputedAt={pageSummary.data?.computed_at}
      />
      {me.isPending || (current.isPending && enabled) ? (
        <Skeleton className="h-24" role="status" aria-label={COPY.loading} />
      ) : me.isError ? (
        <ListStateMessage
          variant="error"
          title={COPY.error}
          action={{ label: COPY.retryQueue, onClick: () => void me.refetch() }}
        />
      ) : denied ? (
        <>
          <p>{COPY.listDenied}</p>
          <PermissionBlockedPanel state="denied" category={COPY.title} />
        </>
      ) : current.isError && !current.isFetchNextPageError ? (
        <ListStateMessage
          variant="error"
          title={COPY.error}
          action={{ label: COPY.retryQueue, onClick: () => void current.refetch() }}
        />
      ) : items?.length ? (
        <>
          <div>
            {items.map((row) => (
              <ObjectRow
                key={row.key}
                ref={(node) => {
                  if (node) rows.current.set(row.item.recovery_item_id, node);
                  else rows.current.delete(row.item.recovery_item_id);
                }}
                title={row.item.reason}
                meta={
                  <span>
                    {[
                      row.item.source?.display_id,
                      row.item.source?.title,
                      row.episode ? '' : row.item.responsible_actor_hint.label,
                      row.resolution ? formatRecoveryTime(row.resolution) : '',
                      !search.history && row.item.presentation.state === 'muted' ? COPY.muted : '',
                      !search.history &&
                      row.item.presentation.state === 'snoozed' &&
                      row.item.presentation.snoozed_until
                        ? COPY.snoozed(formatRecoveryTime(row.item.presentation.snoozed_until))
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    {row.episode && (
                      <>
                        {' '}
                        · <span>{row.episode}</span>
                      </>
                    )}
                  </span>
                }
                selected={selected === row.item.recovery_item_id}
                onClick={(event) => {
                  origin.current = {
                    id: row.item.recovery_item_id,
                    context,
                    node: event.currentTarget,
                  };
                  update({ selected: row.item.recovery_item_id });
                }}
              />
            ))}
          </div>
          <ListLoadMore
            hasMore={!!current.hasNextPage}
            loadingMore={current.isFetchingNextPage}
            failed={current.isFetchNextPageError}
            onLoadMore={() => void current.fetchNextPage()}
          />
        </>
      ) : (
        <ListStateMessage
          variant="empty"
          title={
            search.history
              ? COPY.emptyHistory
              : search.presentation === 'hidden'
                ? COPY.emptyHidden
                : COPY.empty
          }
        />
      )}
    </section>
  );
  const detailPanel =
    active && selected ? (
      <RecoveryPanel
        key={`${context}:${selected}`}
        {...(renderRequestAccess ? { renderRequestAccess } : {})}
        id={selected}
        item={detail.data}
        loading={detail.isPending}
        error={detail.error ?? me.error}
        updatedAt={detail.dataUpdatedAt}
        pageComputedAt={pageSummary.data?.computed_at}
        onClose={close}
        onRetry={() => void detail.refetch()}
        returnTo={location.href}
      />
    ) : undefined;
  return { queue, detailPanel };
}
