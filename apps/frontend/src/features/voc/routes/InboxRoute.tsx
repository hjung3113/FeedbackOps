// InboxRoute — list-first layout for /vocs?view=inbox and /vocs?view=my.
// Owns: URL state reading, useVocList params building, filter/sort/tab handlers,
// out_of_scope_summary peek banner, and VocDetailPanel forwarding into ListShell.
// C9 of Slice 3 #20.

import {
  Button,
  type FilterCategory,
  ListFilterButton,
  ListSortButton,
  ListToolbar,
  type ListToolbarTab,
  PermissionBlockedPanel,
  SearchInput,
  type SortOption,
} from '@fops/ui';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import * as React from 'react';
import { VocDetailPanel } from '../components/detail/VocDetailPanel';
import { VocList } from '../components/list/VocList';
import { useVocList } from '../hooks/useVocList';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface InboxRouteProps {
  view: 'inbox' | 'my';
}

// ── URL state shape (subset of VocSearch) ────────────────────────────────────

type InboxTab = 'untriaged' | 'high' | 'unassigned' | 'similar' | 'no-link';
type InboxSort =
  | 'created_at:desc'
  | 'created_at:asc'
  | 'severity:desc'
  | 'severity:asc'
  | 'reporter_facing_status:asc';

interface InboxSearch {
  managedSystem?: string;
  tab?: InboxTab;
  'filter.severity'?: string;
  'filter.reporterStatus'?: string;
  'filter.owner'?: string;
  sort?: InboxSort;
  selected?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Tab labels mirror docs/design-prototype/screen-voc.jsx (VOC_TABS) verbatim —
// prototype uses English labels for the inbox tabs. The `urgent` flag flips the
// Unassigned tab to the danger token (red) per prototype.
//
// badgeCount is intentionally absent: the prototype's counts (9/7/12/4/5) are
// synthetic local-data aggregates. GET /vocs returns no per-tab count facet, so
// wiring live counts is data-deferred (see PR body, follow-up issue). We do not
// invent counts.
const INBOX_TABS: ListToolbarTab[] = [
  { value: 'untriaged', label: 'Untriaged' },
  { value: 'high', label: 'High' },
  { value: 'unassigned', label: 'Unassigned', urgent: true },
  { value: 'similar', label: 'Similar' },
  { value: 'no-link', label: 'No link' },
];

const FILTER_CATEGORIES: FilterCategory[] = [
  {
    key: 'filter.severity',
    label: '심각도',
    options: [
      { value: 'low', label: '낮음' },
      { value: 'medium', label: '중간' },
      { value: 'high', label: '높음' },
      { value: 'critical', label: '심각' },
    ],
  },
  {
    // Unified on the single URL/UI key `filter.reporterStatus` (#89). The
    // backend's long-form param `filter.reporter_facing_status` is produced
    // only at the useVocList query-string boundary. Previously this category
    // used `filter.reporter_facing_status` — a key that never appeared in the
    // URL — forcing a fragile read/write translation in this route.
    key: 'filter.reporterStatus',
    label: '상태',
    options: [
      { value: 'received', label: '접수됨' },
      { value: 'reviewing', label: '검토중' },
      { value: 'assigned', label: '배정됨' },
      { value: 'progress', label: '진행중' },
      { value: 'prep', label: '준비중' },
      { value: 'resolved', label: '해결됨' },
      { value: 'reopened', label: '재오픈' },
      { value: 'closed', label: '종료됨' },
    ],
  },
  {
    key: 'filter.owner',
    label: '담당',
    options: [
      { value: 'assigned', label: '배정됨' },
      { value: 'unassigned', label: '미배정' },
    ],
  },
];

const SORT_OPTIONS: SortOption[] = [
  { value: 'created_at:desc', label: '최신순' },
  { value: 'created_at:asc', label: '오래된순' },
  { value: 'severity:desc', label: '심각도 높은순' },
  { value: 'severity:asc', label: '심각도 낮은순' },
  { value: 'reporter_facing_status:asc', label: '상태순' },
];

const DEFAULT_SORT = 'created_at:desc';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse a comma-list search string into a string array. */
function parseCommaList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

/** Serialise a string array back to a comma-list, or undefined when empty. */
function serialiseCommaList(arr: string[]): string | undefined {
  return arr.length > 0 ? arr.join(',') : undefined;
}

// ── Slot object returned to the parent route file ────────────────────────────
//
// Decision: InboxRoute is NOT a React component that renders its own ListShell.
// ListShell is the ADR-0020-locked wrapper and lives in _authed/vocs.tsx.
// InboxRoute exposes three render slots (toolbar, list, detailPanel) via an
// object; the parent composes them into ListShell. This avoids double-nesting
// ListShell and keeps shell responsibility in the route file.
//
// The hook `useInboxRoute()` drives all URL state + data logic; the parent
// destructures toolbar/list/detailPanel from the returned object.

export interface InboxRouteSlots {
  /** Full list body: ListToolbar + optional out_of_scope_summary banner + VocList. */
  list: React.ReactElement;
  /** VocDetailPanel when a row is selected; undefined when nothing is selected. */
  detailPanel: React.ReactElement | undefined;
}

export function useInboxRoute(view: 'inbox' | 'my'): InboxRouteSlots {
  const search = useSearch({ strict: false }) as InboxSearch;
  const navigate = useNavigate();

  // ── Derived URL state ─────────────────────────────────────────────────────

  const activeTab = search.tab ?? 'untriaged';
  const currentSort = search.sort ?? DEFAULT_SORT;

  // Parse comma-list filter strings into arrays for ListFilterButton.
  const currentFilters: Record<string, string[]> = React.useMemo(() => {
    const out: Record<string, string[]> = {};
    const sev = parseCommaList(search['filter.severity']);
    if (sev.length > 0) out['filter.severity'] = sev;
    const status = parseCommaList(search['filter.reporterStatus']);
    if (status.length > 0) out['filter.reporterStatus'] = status;
    const owner = parseCommaList(search['filter.owner']);
    if (owner.length > 0) out['filter.owner'] = owner;
    return out;
  }, [search]);

  // ── useVocList params ─────────────────────────────────────────────────────

  const vocList = useVocList({
    view,
    ...(search.managedSystem !== undefined ? { managedSystemId: search.managedSystem } : {}),
    ...(view === 'inbox' ? { tab: activeTab } : {}),
    filters: currentFilters,
    sort: currentSort,
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  // Navigate helpers use `as` casts on individual changed values to avoid
  // fighting exactOptionalPropertyTypes against TanStack Router's internal
  // ParamsReducerFn signature (where `prev` is optional-keyed but our return
  // must be schema-exact). The router validates the output through the route's
  // validateSearch at runtime, so the casts are safe.

  function handleTabChange(next: string): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void navigate({
      to: '/vocs',
      search: (prev: any) => ({ ...prev, tab: next as InboxTab }) as any,
    });
  }

  function handleFiltersChange(next: Record<string, string[]>): void {
    void navigate({
      to: '/vocs',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      search: (prev: any) =>
        ({
          ...prev,
          'filter.severity': serialiseCommaList(next['filter.severity'] ?? []),
          'filter.reporterStatus': serialiseCommaList(next['filter.reporterStatus'] ?? []),
          'filter.owner': serialiseCommaList(next['filter.owner'] ?? []),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
    });
  }

  function handleSortChange(next: string): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void navigate({
      to: '/vocs',
      search: (prev: any) => ({ ...prev, sort: next as InboxSort }) as any,
    });
  }

  function handleRowSelect(id: string): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void navigate({ to: '/vocs', search: (prev: any) => ({ ...prev, selected: id }) as any });
  }

  function handlePanelClose(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void navigate({
      to: '/vocs',
      search: (prev: any) => ({ ...prev, selected: undefined }) as any,
    });
  }

  // ── Slots ─────────────────────────────────────────────────────────────────
  //
  // Composition strategy: ListToolbar is rendered as the first child of the
  // `list` slot inside ListShell. This keeps ListShell as the ADR-0020 wrapper
  // while using ListToolbar (with built-in Tabs) instead of ListShell's
  // ShellHeader-based `toolbar` prop. ListShell's `toolbar` prop renders a
  // ShellHeader which has no Tabs slot; ListToolbar from @fops/ui already owns
  // both the title/tabs row and the actions row in one sticky component.

  const outOfScopeBanner = vocList.data?.out_of_scope_summary ? (
    <PermissionBlockedPanel
      state="summary_visible"
      category="조회 권한 외 VOC"
      summary={
        <div>
          <p>{vocList.data.out_of_scope_summary.count}건의 VOC를 조회할 수 없습니다.</p>
          <p className="text-xs text-text-muted">
            심각도 분포:{' '}
            {Object.entries(vocList.data.out_of_scope_summary.severity_distribution)
              .map(([sev, n]) => `${sev}=${String(n)}`)
              .join(', ')}
          </p>
        </div>
      }
      className="mx-4 mt-3"
    />
  ) : null;

  const list = (
    <>
      <ListToolbar
        {...(view === 'inbox'
          ? {
              tabs: INBOX_TABS,
              activeTab,
              onTabChange: handleTabChange,
            }
          : { title: 'My VOCs' })}
        action={
          <div className="flex items-center gap-2">
            {/* Prototype placeholder verbatim (screen-voc.jsx). value/onChange is
                deferred: SearchInput is disabled until the search endpoint ships
                (no live search facet on GET /vocs). */}
            <SearchInput placeholder="필터, 키워드…" />
            <ListFilterButton
              categories={FILTER_CATEGORIES}
              values={currentFilters}
              onChange={handleFiltersChange}
            />
            <ListSortButton
              options={SORT_OPTIONS}
              value={currentSort}
              defaultValue={DEFAULT_SORT}
              onChange={handleSortChange}
            />
            {/* Prototype: primary Button (not a text link). Label verbatim "New VOC". */}
            <Button asChild variant="primary" size="sm" className="gap-1.5 whitespace-nowrap">
              <Link to="/vocs" search={{ action: 'create' }}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                New VOC
              </Link>
            </Button>
          </div>
        }
      />
      {outOfScopeBanner}
      <VocList
        items={vocList.data?.items ?? []}
        loading={vocList.isLoading}
        error={vocList.error ?? null}
        selectedId={search.selected ?? null}
        onSelect={handleRowSelect}
        view={view}
        onRetry={() => {
          void vocList.refetch();
        }}
      />
    </>
  );

  const detailPanel =
    search.selected !== undefined ? (
      <VocDetailPanel vocId={search.selected} onClose={handlePanelClose} />
    ) : undefined;

  return { list, detailPanel };
}
