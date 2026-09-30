import { resolveActors } from '@/lib/api';
import { fetchManagedSystems } from '@/lib/api/managed-systems';
import { ENTITY_LINK_RELATION_LABELS } from '@/lib/copy/enum-labels';
import type { EntityLinkRelationType, EntityLinkStatus } from '@fops/shared';
import { Button, ListFilterButton, ListToolbar, type ListToolbarTab, SearchInput } from '@fops/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { RefreshCw } from 'lucide-react';
import * as React from 'react';
import { EntityLinksInventoryTable } from '../components/EntityLinksInventoryTable';
import {
  entityLinkInventoryQueryKey,
  useEntityLinkInventory,
} from '../hooks/useEntityLinkInventory';

type StatusFilter = EntityLinkStatus;

/**
 * The route's own search contract, not the entity-link domain's. The route
 * schema admits exactly one relation type (`z.enum(['related_to'])`) and is
 * `.strict()`, so widening `type` to the full `EntityLinkRelationType` union
 * here would let a navigate() push a value that `validateSearch` then throws
 * on. Keep this narrower than the domain type on purpose.
 */
interface LinksSearch {
  status?: StatusFilter;
  type?: SearchableRelationType;
  managedSystem?: string;
}

/** The relation types this route can carry in its URL. */
const SEARCHABLE_RELATION_TYPES = [
  'related_to',
] as const satisfies readonly EntityLinkRelationType[];
type SearchableRelationType = (typeof SEARCHABLE_RELATION_TYPES)[number];

function toSearchableRelationType(value: string | undefined): SearchableRelationType | undefined {
  return SEARCHABLE_RELATION_TYPES.find((t) => t === value);
}

const STATUS_TABS: ListToolbarTab[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'stale', label: 'Stale', urgent: true },
  { value: 'detached', label: 'Detached' },
  { value: 'revoked', label: 'Revoked' },
];

const STATUS_TAB_VALUES: StatusFilter[] = ['active', 'stale', 'detached', 'revoked'];

const FILTER_CATEGORIES = [
  {
    key: 'type',
    label: '관계 유형',
    options: [{ value: 'related_to', label: ENTITY_LINK_RELATION_LABELS.related_to }],
  },
];

export function LinksRoute() {
  const search = useSearch({ strict: false }) as LinksSearch;
  const queryClient = useQueryClient();
  // `from` is what types the search reducer. Without it useNavigate() hands the
  // reducer the router-wide search union (12 keys), which is not assignable to
  // this route's 3-key reducer signature — that mismatch was the long-standing
  // TS2322 baseline entry. Both navigate() calls below target this same route
  // by absolute path, so pinning `from` changes no runtime behaviour.
  const navigate = useNavigate({ from: '/integration/links' });

  const activeTab = search.status ?? 'all';
  const currentFilters = React.useMemo(
    () => (search.type !== undefined ? { type: [search.type] } : {}),
    [search.type],
  );

  const inventoryParams = React.useMemo(
    () => ({
      ...(search.status !== undefined ? { status: search.status } : {}),
      ...(search.type !== undefined ? { relationType: search.type } : {}),
      ...(search.managedSystem !== undefined ? { managedSystemId: search.managedSystem } : {}),
    }),
    [search.managedSystem, search.status, search.type],
  );
  const previousInventoryParams = React.useRef(inventoryParams);
  React.useEffect(() => {
    const previous = previousInventoryParams.current;
    previousInventoryParams.current = inventoryParams;
    if (
      previous.status === inventoryParams.status &&
      previous.relationType === inventoryParams.relationType &&
      previous.managedSystemId === inventoryParams.managedSystemId
    ) {
      return;
    }

    const queryKey = entityLinkInventoryQueryKey(inventoryParams);
    const cachedPages = queryClient.getQueryData<{ pages: unknown[] }>(queryKey)?.pages;
    if (cachedPages && cachedPages.length > 1) {
      void queryClient.resetQueries({ queryKey, exact: true });
    }
  }, [inventoryParams, queryClient]);

  const inventory = useEntityLinkInventory(inventoryParams);
  const inventoryItems = React.useMemo(
    () => inventory.data?.pages.flatMap((page) => page.items) ?? [],
    [inventory.data],
  );

  const activeFilterDescription = React.useMemo(() => {
    const conditions: string[] = [];
    if (search.status !== undefined) {
      const statusLabel = STATUS_TABS.find((tab) => tab.value === search.status)?.label;
      conditions.push(`상태: ${statusLabel ?? search.status}`);
    }
    if (search.type !== undefined) {
      conditions.push(`관계 유형: ${ENTITY_LINK_RELATION_LABELS[search.type]}`);
    }
    return conditions.length > 0 ? conditions.join(' · ') : undefined;
  }, [search.status, search.type]);
  const needsUnfilteredCheck =
    activeFilterDescription !== undefined &&
    inventory.isSuccess &&
    inventoryItems.length === 0 &&
    inventory.hasNextPage !== true;
  const unfilteredInventory = useEntityLinkInventory(
    {
      ...(search.managedSystem !== undefined ? { managedSystemId: search.managedSystem } : {}),
    },
    needsUnfilteredCheck,
  );
  const tableError =
    inventoryItems.length === 0
      ? (inventory.error ?? (needsUnfilteredCheck ? unfilteredInventory.error : null))
      : null;
  const retryTable = React.useCallback((): void => {
    if (inventory.isFetchNextPageError) {
      void inventory.fetchNextPage();
    } else if (inventory.error) {
      void inventory.refetch();
    } else {
      void unfilteredInventory.refetch();
    }
  }, [
    inventory.error,
    inventory.fetchNextPage,
    inventory.isFetchNextPageError,
    inventory.refetch,
    unfilteredInventory.refetch,
  ]);

  const countInventory = useEntityLinkInventory({
    ...(search.type !== undefined ? { relationType: search.type } : {}),
    ...(search.managedSystem !== undefined ? { managedSystemId: search.managedSystem } : {}),
  });

  const managedSystemsQuery = useQuery({
    queryKey: ['managed-systems', 'all'] as const,
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived: true, signal }),
    staleTime: 10 * 60 * 1000,
  });

  const actorIds = React.useMemo(
    () => [
      ...new Set(
        inventoryItems
          .map((item) => item.created_by)
          .filter((id): id is string => typeof id === 'string'),
      ),
    ],
    [inventoryItems],
  );
  const actorsQuery = useQuery({
    queryKey: ['actors-resolve', actorIds, []] as const,
    queryFn: ({ signal }) => resolveActors({ actorIds }, signal),
    enabled: actorIds.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  const managedSystemsById = React.useMemo(() => {
    const out: Record<string, { name: string; archived: boolean }> = {};
    for (const ms of managedSystemsQuery.data?.items ?? []) {
      out[ms.id] = {
        name: ms.name,
        archived: ms.archived_at !== null,
      };
    }
    return out;
  }, [managedSystemsQuery.data]);

  const actorsById = React.useMemo(() => {
    const out: Record<string, { display_name: string }> = {};
    for (const actor of actorsQuery.data?.actors ?? []) {
      out[actor.id] = { display_name: actor.display_name };
    }
    return out;
  }, [actorsQuery.data]);

  const statusTabs = React.useMemo<ListToolbarTab[]>(() => {
    const items = countInventory.data?.pages.flatMap((page) => page.items) ?? [];
    const statusCounts = countInventory.data?.pages[0]?.page?.status_counts;
    const counts = new Map<string, number>([
      [
        'all',
        statusCounts !== undefined
          ? statusCounts.active + statusCounts.stale + statusCounts.detached + statusCounts.revoked
          : items.length,
      ],
    ]);
    for (const status of STATUS_TAB_VALUES) {
      counts.set(
        status,
        statusCounts !== undefined
          ? statusCounts[status]
          : items.filter((link) => link.status === status).length,
      );
    }
    return STATUS_TABS.map((tab) => ({
      ...tab,
      badgeCount: counts.get(tab.value) ?? 0,
    }));
  }, [countInventory.data]);

  function handleStatusChange(next: string): void {
    void navigate({
      to: '/integration/links',
      search: (prev) => {
        const { type, managedSystem } = prev;
        if (next === 'all') {
          return {
            ...(type !== undefined ? { type } : {}),
            ...(managedSystem !== undefined ? { managedSystem } : {}),
          };
        }
        return {
          status: next as StatusFilter,
          ...(type !== undefined ? { type } : {}),
          ...(managedSystem !== undefined ? { managedSystem } : {}),
        };
      },
    });
  }

  function handleFiltersChange(next: Record<string, string[]>): void {
    const type = toSearchableRelationType(next.type?.[0]);
    void navigate({
      to: '/integration/links',
      search: (prev): LinksSearch => {
        const { status, managedSystem } = prev;
        if (type === undefined) {
          return {
            ...(status !== undefined ? { status } : {}),
            ...(managedSystem !== undefined ? { managedSystem } : {}),
          };
        }
        return {
          ...(status !== undefined ? { status } : {}),
          type,
          ...(managedSystem !== undefined ? { managedSystem } : {}),
        };
      },
    });
  }

  function handleResetFilters(): void {
    void navigate({
      to: '/integration/links',
      search: (prev): LinksSearch => ({
        ...(prev.managedSystem !== undefined ? { managedSystem: prev.managedSystem } : {}),
      }),
    });
  }

  return (
    <>
      <ListToolbar
        tabs={statusTabs}
        activeTab={activeTab}
        onTabChange={handleStatusChange}
        action={
          <div className="flex items-center gap-2">
            <SearchInput placeholder="Entity link 검색…" />
            <ListFilterButton
              categories={FILTER_CATEGORIES}
              values={currentFilters}
              onChange={handleFiltersChange}
            />
            {search.managedSystem !== undefined && search.managedSystem !== 'all' && (
              <span className="rounded border border-border-subtle px-2 py-1 font-mono text-xs text-text-muted">
                {search.managedSystem.slice(0, 8)}
              </span>
            )}
            <Button
              variant="subtle"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                void inventory.refetch();
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Refresh
            </Button>
          </div>
        }
      />
      <EntityLinksInventoryTable
        items={inventoryItems}
        loading={inventory.isLoading || (needsUnfilteredCheck && unfilteredInventory.isPending)}
        error={tableError ?? null}
        managedSystemsById={managedSystemsById}
        actorsById={actorsById}
        onRetry={retryTable}
        unfilteredItemsCount={
          unfilteredInventory.data?.pages.flatMap((page) => page.items).length ?? 0
        }
        filterDescription={activeFilterDescription}
        onResetFilters={handleResetFilters}
        hasMore={inventory.hasNextPage === true}
        loadingMore={inventory.isFetchingNextPage}
        loadMoreError={inventory.isFetchNextPageError ? inventory.error : null}
        onLoadMore={() => {
          void inventory.fetchNextPage();
        }}
      />
    </>
  );
}
