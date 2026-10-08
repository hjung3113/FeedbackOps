// InboxRoute — list-first layout for /vocs?view=inbox and /vocs?view=my.
// Owns: URL state reading, useVocList params building, filter/sort/tab handlers,
// out_of_scope_summary peek banner, and VocDetailPanel forwarding into ListShell.
// C9 of Slice 3 #20.

import { RequestAccessButton } from '@/features/admin/permissions/request-access-button';
import { isPermissionDenied } from '@/lib/api/types';
import { GLOSSARY, createLabel } from '@/lib/copy/glossary';
import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import { VOC_INBOX_NO_LINK_TAB_LABEL } from '@/lib/copy/voc-views';
import {
  Button,
  type FilterCategory,
  ListFilterButton,
  ListSortButton,
  ListToolbar,
  type ListToolbarTab,
  PermissionBlockedPanel,
  SEVERITY_LABELS,
  SearchInput,
  type SortOption,
} from '@fops/ui';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { ArrowRight, Flag, Link as LinkIcon, Plus, TriangleAlert, User } from 'lucide-react';
import * as React from 'react';
import { VocDetailPanel } from '../components/detail/VocDetailPanel';
import { VocList } from '../components/list/VocList';
import { useCommittedSearchDraft } from '../hooks/useCommittedSearchDraft';
import { useVocList } from '../hooks/useVocList';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface InboxRouteProps {
  view: 'inbox' | 'my';
}

// ── URL state shape (subset of VocSearch) ────────────────────────────────────

type InboxTab =
  | 'untriaged'
  | 'high'
  | 'unassigned'
  | 'similar'
  | 'no-link'
  | 'high-no-link'
  | 'no-task';
type InboxSort =
  | 'created_at:desc'
  | 'created_at:asc'
  | 'severity:desc'
  | 'severity:asc'
  | 'reporter_facing_status:asc';

interface InboxSearch {
  q?: string;
  managedSystem?: string;
  tab?: InboxTab;
  'filter.severity'?: string;
  'filter.reporterStatus'?: string;
  'filter.owner'?: string;
  'filter.analytics_area'?: 'unset';
  sort?: InboxSort;
  selected?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Tab labels mirror screen-voc.jsx `VOC_TABS` verbatim except `similar` (#592 / ADR-0031):
// its URL key stays accepted for old links and saved views, but the tab is hidden until its
// predicate exists (see 04-voc-system, “Similar VOC Suggested”).
// The `urgent` flag flips the Unassigned tab to the danger token (red) per prototype.
//
// badgeCount is intentionally absent: the prototype's counts (9/7/12/4/5) are
// synthetic local-data aggregates. GET /vocs returns no per-tab count facet, so
// wiring live counts is data-deferred (see PR body, follow-up issue). We do not
// invent counts.
const INBOX_TABS: ListToolbarTab[] = [
  { value: 'untriaged', label: GLOSSARY.untriaged, icon: Flag, tip: '아직 분류되지 않은 VOC' },
  { value: 'high', label: GLOSSARY.high, icon: TriangleAlert, tip: '높음 · 심각 심각도' },
  {
    value: 'unassigned',
    label: GLOSSARY.unassigned,
    urgent: true,
    icon: User,
    tip: '담당자 미지정',
  },
  {
    value: 'no-link',
    label: VOC_INBOX_NO_LINK_TAB_LABEL,
    icon: LinkIcon,
    tip: 'Finding / Task 연결 없음',
  },
  {
    value: 'high-no-link',
    label: GLOSSARY.highNoLink,
    icon: TriangleAlert,
    tip: '높음 이상인데 Finding / Task 연결 없음',
  },
  // The prototype has no No task icon or tip; reuse the link icon without inventing copy.
  { value: 'no-task', label: GLOSSARY.noTask, icon: LinkIcon },
];

const FILTER_CATEGORIES: FilterCategory[] = [
  {
    key: 'filter.severity',
    label: '심각도',
    options: Object.entries(SEVERITY_LABELS).map(([value, label]) => ({ value, label })),
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

// #821: keystrokes settle for this long before the URL q (and thus the fetch) updates.
export const SEARCH_DEBOUNCE_MS = 300;
// #875: while an IME composition is active, wait longer so a paused half-typed syllable is not searched.
export const SEARCH_COMPOSING_DEBOUNCE_MS = 1000;

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
  const navigate = useNavigate({ from: '/vocs' });

  // ── Derived URL state ─────────────────────────────────────────────────────

  const hasAnalyticsAreaUnsetFilter = search['filter.analytics_area'] === 'unset';
  // #821: the URL q is the source of truth for the fetch; the box keeps a
  // local draft so keystrokes do not navigate on every character.
  const urlQ = search.q ?? '';
  // #821 owner decision: a search covers the whole inbox. The inbox has no
  // "all" tab, so a tab-scoped search could never find an already-triaged VOC.
  // Starting a search drops the tab (remembered below); a tab picked during the
  // search narrows it to that tab.
  const searchingAllTabs = view === 'inbox' && urlQ !== '' && search.tab === undefined;
  const activeTab = searchingAllTabs
    ? ''
    : (search.tab ?? (hasAnalyticsAreaUnsetFilter ? '' : 'untriaged'));
  const apiTab = searchingAllTabs
    ? undefined
    : (search.tab ?? (hasAnalyticsAreaUnsetFilter ? undefined : 'untriaged'));
  const currentSort = search.sort ?? DEFAULT_SORT;
  // The tab the current search started from, restored when the search is cleared.
  const tabBeforeSearchRef = React.useRef<InboxTab | undefined>(undefined);
  // #864: the hook calls this to write the URL q, from its debounced effect and
  // its immediate Enter/blur commit. Carries the #821 tab rules: starting a
  // search drops the remembered tab, clearing restores it. While a commit is
  // still pending, those rules see `base` — that draft, not the URL it has not
  // reached yet. `urlQ` is not a dep: the hook reads it as `committed`.
  const writeSearchDraft = React.useCallback(
    (draft: string, base: string) => {
      const urlTab = search.tab;
      const clearing = draft === '';
      const starting = base === '' && !clearing && view === 'inbox';
      if (starting) tabBeforeSearchRef.current = urlTab;
      const restoreTab = clearing ? tabBeforeSearchRef.current : undefined;
      if (clearing) tabBeforeSearchRef.current = undefined;
      void navigate({
        to: '/vocs',
        search: (prev) => {
          const { q: _q, ...rest } = prev;
          // An empty box removes q and returns to the tab the search started
          // from, unless a tab was picked during the search. Anything else is
          // written verbatim (the backend owns trimming).
          if (clearing) {
            return rest.tab === undefined && restoreTab !== undefined
              ? { ...rest, tab: restoreTab }
              : rest;
          }
          if (starting) {
            const { tab: _tab, ...withoutTab } = rest;
            return { ...withoutTab, q: draft };
          }
          return { ...rest, q: draft };
        },
        replace: true,
      });
    },
    [navigate, search.tab, view],
  );
  const { draft, setDraft, commit, setComposing } = useCommittedSearchDraft({
    committed: urlQ,
    write: writeSearchDraft,
    debounceMs: SEARCH_DEBOUNCE_MS,
    composingDebounceMs: SEARCH_COMPOSING_DEBOUNCE_MS,
  });

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

  const apiFilters = React.useMemo(() => {
    const analyticsArea = search['filter.analytics_area'];
    return analyticsArea === 'unset'
      ? { ...currentFilters, 'filter.analytics_area': [analyticsArea] }
      : currentFilters;
  }, [currentFilters, search['filter.analytics_area']]);

  // ── useVocList params ─────────────────────────────────────────────────────

  const vocList = useVocList({
    view,
    ...(search.managedSystem !== undefined ? { managedSystemId: search.managedSystem } : {}),
    ...(view === 'inbox' && apiTab !== undefined ? { tab: apiTab } : {}),
    ...(urlQ !== '' ? { q: urlQ } : {}),
    filters: apiFilters,
    sort: currentSort,
  });
  const isSearching = urlQ !== '';
  // Captured outside JSX: property narrowing does not survive into the renderTrigger callback.
  const deniedMsScoped =
    isPermissionDenied(vocList.error) &&
    typeof vocList.error.envelope.requestable_permission?.managed_system_id === 'string';

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleTabChange(next: string): void {
    void navigate({
      to: '/vocs',
      search: (prev) => ({ ...prev, tab: next as InboxTab }),
    });
  }

  function handleFiltersChange(next: Record<string, string[]>): void {
    void navigate({
      to: '/vocs',
      search: (prev) => {
        const {
          'filter.severity': _severity,
          'filter.reporterStatus': _reporterStatus,
          'filter.owner': _owner,
          ...rest
        } = prev;
        const severity = serialiseCommaList(next['filter.severity'] ?? []);
        const reporterStatus = serialiseCommaList(next['filter.reporterStatus'] ?? []);
        const owner = serialiseCommaList(next['filter.owner'] ?? []);
        return {
          ...rest,
          ...(severity !== undefined ? { 'filter.severity': severity } : {}),
          ...(reporterStatus !== undefined ? { 'filter.reporterStatus': reporterStatus } : {}),
          ...(owner !== undefined ? { 'filter.owner': owner } : {}),
        };
      },
    });
  }

  function handleSortChange(next: string): void {
    void navigate({
      to: '/vocs',
      search: (prev) => ({ ...prev, sort: next as InboxSort }),
    });
  }

  function handleRowSelect(id: string): void {
    void navigate({ to: '/vocs', search: (prev) => ({ ...prev, selected: id }) });
  }

  function handlePanelClose(): void {
    void navigate({
      to: '/vocs',
      search: ({ selected: _selected, ...rest }) => rest,
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
          : { title: GLOSSARY.myVocs })}
        action={
          <div className="flex items-center gap-2">
            {/* #821: server-side text search on GET /vocs. The box is a local
                draft; useCommittedSearchDraft writes the URL q on debounce or
                Enter/blur (#864). */}
            <SearchInput
              placeholder="필터, 키워드…"
              value={draft}
              onValueChange={setDraft}
              onCommit={commit}
              onComposingChange={setComposing}
            />
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
            {/* Prototype: primary Button (not a text link). #679 Korean-first label. */}
            <Button asChild variant="primary" size="sm" spacing="compact">
              <Link to="/vocs" search={{ action: 'create' }}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {createLabel('VOC')}
              </Link>
            </Button>
          </div>
        }
      />
      {outOfScopeBanner}
      {isPermissionDenied(vocList.error) ? (
        <div className="m-4 space-y-3">
          {vocList.error.envelope.requestable_permission ? (
            <RequestAccessButton
              capability={vocList.error.envelope.requestable_permission.permission}
              returnRouteIntent={`/vocs?view=${view}`}
              {...(typeof vocList.error.envelope.requestable_permission.managed_system_id ===
              'string'
                ? {
                    managedSystemId:
                      vocList.error.envelope.requestable_permission.managed_system_id,
                  }
                : {})}
              renderTrigger={(onRequestAccess) => (
                <PermissionBlockedPanel
                  // The server marks the capability requestable, so its panel state owns the CTA.
                  state="request_access"
                  category="VOC 수신함"
                  // #562 copy: a named Managed System means this selected scope is out of reach.
                  reason={
                    deniedMsScoped
                      ? PERMISSION_BLOCKED_REASONS.vocInboxManagedSystem
                      : PERMISSION_BLOCKED_REASONS.vocInbox
                  }
                  onRequestAccess={onRequestAccess}
                />
              )}
            />
          ) : (
            <PermissionBlockedPanel
              // docs/frontend/specs/voc.md R-VOC-INBOX: no read scope and nothing requestable
              // -> blocked_not_requestable (#562).
              state="blocked_not_requestable"
              category="VOC 수신함"
              reason={PERMISSION_BLOCKED_REASONS.vocInbox}
            />
          )}
          {view === 'inbox' &&
          typeof vocList.error.envelope.requestable_permission?.managed_system_id !== 'string' ? (
            <Button
              asChild
              variant="subtle"
              size="sm"
              spacing="compact"
              data-testid="voc-inbox-denied-my-vocs"
            >
              <Link to="/vocs" search={{ view: 'my' }}>
                {GLOSSARY.myVocs}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <VocList
          items={vocList.data?.items ?? []}
          // Placeholder data keeps the previous page while the next key loads.
          // `isLoading` is then false. VocList still mounts rows when items
          // exist; an empty previous page must stay on the skeleton branch
          // instead of the old query's empty state. A real error replaces
          // placeholder data, so that branch is unchanged.
          loading={vocList.isLoading || vocList.isPlaceholderData}
          error={vocList.error ?? null}
          selectedId={search.selected ?? null}
          onSelect={handleRowSelect}
          view={view}
          searching={isSearching}
          onRetry={() => {
            void vocList.refetch();
          }}
          onCreate={() =>
            void navigate({
              to: '/vocs',
              search: (previous) => ({ ...previous, action: 'create' }),
            })
          }
        />
      )}
    </>
  );

  const detailPanel =
    search.selected !== undefined ? (
      <VocDetailPanel
        vocId={search.selected}
        {...(search.managedSystem !== undefined ? { managedSystemId: search.managedSystem } : {})}
        onClose={handlePanelClose}
      />
    ) : undefined;

  return { list, detailPanel };
}
