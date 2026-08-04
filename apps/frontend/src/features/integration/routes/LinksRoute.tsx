import { resolveActors } from '@/lib/api';
import { fetchManagedSystems } from '@/lib/api/managed-systems';
import type { EntityLinkRelationType, EntityLinkStatus } from '@fops/shared';
import { Button, ListFilterButton, ListToolbar, type ListToolbarTab, SearchInput } from '@fops/ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { RefreshCw } from 'lucide-react';
import * as React from 'react';
import { EntityLinksInventoryTable } from '../components/EntityLinksInventoryTable';
import { useEntityLinkInventory } from '../hooks/useEntityLinkInventory';

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
const SEARCHABLE_RELATION_TYPES = ['related_to'] as const satisfies readonly EntityLinkRelationType[];
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
    label: 'Rel type',
    options: [{ value: 'related_to', label: 'related_to' }],
  },
];

export function LinksRoute() {
  const search = useSearch({ strict: false }) as LinksSearch;
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

  const inventory = useEntityLinkInventory({
    ...(search.status !== undefined ? { status: search.status } : {}),
    ...(search.type !== undefined ? { relationType: search.type } : {}),
    ...(search.managedSystem !== undefined ? { managedSystemId: search.managedSystem } : {}),
  });

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
        (inventory.data?.items ?? [])
          .map((item) => item.created_by)
          .filter((id): id is string => typeof id === 'string'),
      ),
    ],
    [inventory.data?.items],
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
    const items = countInventory.data?.items ?? [];
    const counts = new Map<string, number>([['all', items.length]]);
    for (const status of STATUS_TAB_VALUES) {
      counts.set(
        status,
        items.filter((link) => link.status === status).length,
      );
    }
    return STATUS_TABS.map((tab) => ({
      ...tab,
      badgeCount: counts.get(tab.value) ?? 0,
    }));
  }, [countInventory.data?.items]);

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
        items={inventory.data?.items ?? []}
        loading={inventory.isLoading}
        error={inventory.error ?? null}
        managedSystemsById={managedSystemsById}
        actorsById={actorsById}
        onRetry={() => {
          void inventory.refetch();
        }}
      />
    </>
  );
}
