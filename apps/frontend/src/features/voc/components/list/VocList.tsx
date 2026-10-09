/**
 * VocList — composes VOC rows with loading / empty / error states, bulk
 * selection, and the bulk-action bar (mirrors docs/design-prototype/screen-voc.jsx
 * `VocList`).
 *
 * LIFTED MAP HOOKS: per-row lookups (managed system, actor identity for
 * owner/reporter, analytics-area name) are resolved by single map queries at
 * the VocList level and passed to each VocRow via props. This avoids calling
 * hooks inside .map() and keeps fetch count constant regardless of row count.
 *
 * BULK ACTIONS (#89): selection state + the bar UI are wired here. The
 * individual mutations (담당자 지정 / 심각도 설정 / Cluster에 추가 / Finding 생성)
 * have no batch endpoint yet, so their buttons are present-but-disabled and the
 * action is deferred to a follow-up issue. "선택 해제" is fully wired.
 */

import { ListStateMessage } from '@/components/ListStateMessage';
import { fetchAnalyticsAreas, fetchManagedSystems } from '@/lib/api';
import { VOC_LIST_LOAD_ERROR_LABELS, VOC_SEARCH_EMPTY_LABEL } from '@/lib/copy/voc';
import type { ResolvedManagedSystem } from '@/lib/cross-system/useManagedSystem';
import { usePermissionCheck } from '@/lib/cross-system/usePermissionCheck';
import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import type { VocListItem } from '@fops/shared';
import { type AvatarUser, Button, EmptyState, managedSystemMarkColor } from '@fops/ui';
import { useQuery } from '@tanstack/react-query';
import { FileText, Flag, Layers, User } from 'lucide-react';
import * as React from 'react';
import { useMemo, useState } from 'react';
import { VocRow } from './VocRow';
import { VocRowSkeleton } from './VocRowSkeleton';

// ---------------------------------------------------------------------------
// useManagedSystemMap — lifted map hook
// ---------------------------------------------------------------------------

function useManagedSystemMap(): Record<string, ResolvedManagedSystem> {
  const { data } = useQuery({
    queryKey: ['managed-systems', 'all'],
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived: true, signal }),
    staleTime: 10 * 60 * 1000,
  });

  return useMemo(() => {
    if (!data) return {};
    const map: Record<string, ResolvedManagedSystem> = {};
    for (const ms of data.items) {
      map[ms.id] = {
        id: ms.id,
        name: ms.name,
        mark: managedSystemMarkColor(ms.slug),
        archived: ms.archived_at !== null,
      };
    }
    return map;
  }, [data]);
}

// ---------------------------------------------------------------------------
// useAnalyticsAreaMap — lifted map hook (id → area name)
// ---------------------------------------------------------------------------

function useAnalyticsAreaMap(): Record<string, string> {
  const { data } = useQuery({
    queryKey: ['analytics-areas', 'all'],
    queryFn: ({ signal }) => fetchAnalyticsAreas({ signal }),
    staleTime: 10 * 60 * 1000,
  });

  return useMemo(() => {
    if (!data) return {};
    const map: Record<string, string> = {};
    for (const area of data.items) {
      map[area.id] = area.name;
    }
    return map;
  }, [data]);
}

// ---------------------------------------------------------------------------
// useActorMap — lifted map hook (actor id → AvatarUser)
// ---------------------------------------------------------------------------

function useActorMap(): Record<string, AvatarUser> {
  const { actors } = useWorkspaceActors();

  return useMemo(() => {
    if (!actors) return {};
    const map: Record<string, AvatarUser> = {};
    for (const a of actors) {
      map[a.id] = { display_name: a.display_name };
    }
    return map;
  }, [actors]);
}

// ---------------------------------------------------------------------------
// VocList props
// ---------------------------------------------------------------------------

export interface VocListProps {
  items: VocListItem[];
  loading: boolean;
  error: Error | null;
  selectedId?: string | null;
  onSelect: (id: string) => void;
  /** When provided, list emits an empty-state with the variant copy. */
  view?: 'inbox' | 'my';
  /**
   * #821: a server-side text search (q) is active. An empty list then renders
   * the search empty state instead of the queue/my-VOC copy.
   */
  searching?: boolean;
  /** Retry handler for error variant. */
  onRetry?: () => void;
  /** Opens the route-owned VOC create flow from an empty list state. */
  onCreate?: () => void;
}

const SKELETON_COUNT = 10;

// ---------------------------------------------------------------------------
// VocList
// ---------------------------------------------------------------------------

export function VocList({
  items,
  loading,
  error,
  selectedId,
  onSelect,
  view,
  searching,
  onRetry,
  onCreate,
}: VocListProps) {
  const msMap = useManagedSystemMap();
  const areaMap = useAnalyticsAreaMap();
  const actorMap = useActorMap();

  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const toggleCheck = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearChecked = () => {
    setChecked(new Set());
  };

  // Drop selections that no longer exist in the current list (tab/filter change).
  React.useEffect(() => {
    setChecked((prev) => {
      if (prev.size === 0) return prev;
      const present = new Set(items.map((v) => v.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (present.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [items]);

  // 1. Loading with no items → skeletons
  if (loading && items.length === 0) {
    return (
      <div role="rowgroup" aria-label="VOC 목록 로딩 중">
        {Array.from({ length: SKELETON_COUNT }, (_, i) => (
          <VocRowSkeleton key={i} />
        ))}
      </div>
    );
  }

  // 2. Error with no items → error empty state
  if (error !== null && items.length === 0) {
    return (
      <EmptyState
        title={VOC_LIST_LOAD_ERROR_LABELS.title}
        body={VOC_LIST_LOAD_ERROR_LABELS.body}
        action={
          onRetry !== undefined ? (
            <Button onClick={onRetry} type="button">
              {VOC_LIST_LOAD_ERROR_LABELS.retry}
            </Button>
          ) : undefined
        }
      />
    );
  }

  // 3. Empty list
  if (!loading && items.length === 0) {
    // #821: an active server search owns the empty state — the queue/my-VOC
    // copy would wrongly imply there is nothing to find.
    if (searching) {
      return <ListStateMessage variant="empty" title={VOC_SEARCH_EMPTY_LABEL} />;
    }
    if (view === 'my') {
      return (
        <ListStateMessage
          variant="empty"
          title="내가 제출한 VOC가 없습니다"
          {...(onCreate !== undefined
            ? { action: { label: '+ 새 VOC 작성', onClick: onCreate } }
            : {})}
        />
      );
    }
    // inbox or unspecified
    return (
      <ListStateMessage
        variant="empty"
        title="큐가 비었습니다"
        body="제출된 VOC가 표시됩니다."
        {...(onCreate !== undefined
          ? { action: { label: '+ 새 VOC 작성', onClick: onCreate } }
          : {})}
      />
    );
  }

  // 4. Rows (+ bulk-action bar)
  return (
    <div role="rowgroup" aria-label="VOC 목록">
      {checked.size > 0 && <BulkActionBar count={checked.size} onClear={clearChecked} />}
      {items.map((voc) => {
        const rowProps = {
          voc,
          selected: selectedId === voc.id,
          onSelect: () => {
            onSelect(voc.id);
          },
          managedSystem: msMap[voc.primary_managed_system_id] ?? null,
          owner: voc.owner_user_id !== null ? (actorMap[voc.owner_user_id] ?? null) : null,
          reporter: actorMap[voc.reporter_id] ?? null,
          areaName:
            voc.analytics_area_id !== null ? (areaMap[voc.analytics_area_id] ?? null) : null,
          checked: checked.has(voc.id),
          onToggleCheck: () => {
            toggleCheck(voc.id);
          },
        };

        return view === 'my' ? (
          <ReporterMyVocRow key={voc.id} {...rowProps} />
        ) : (
          <VocRow key={voc.id} {...rowProps} />
        );
      })}
    </div>
  );
}

VocList.displayName = 'VocList';

type ReporterMyVocRowProps = React.ComponentProps<typeof VocRow>;

function ReporterMyVocRow(props: ReporterMyVocRowProps): React.ReactElement {
  const readCheck = usePermissionCheck({
    capability: 'voc.read',
    managedSystemId: props.voc.primary_managed_system_id,
  });
  const triageCheck = usePermissionCheck({
    capability: 'voc.triage',
    managedSystemId: props.voc.primary_managed_system_id,
  });
  const showOwnerMissing =
    readCheck.data?.state === 'approved' || triageCheck.data?.state === 'approved';

  return <VocRow {...props} showOwnerMissing={showOwnerMissing} />;
}

// ---------------------------------------------------------------------------
// BulkActionBar — appears when ≥1 row is checked. Korean adaptation of the
// prototype copy: "N selected · Assign / Set severity / Add to cluster / Create finding · Clear".
//
// DEFERRED (#89): the four mutating actions have no batch endpoint yet, so they
// are disabled with a tooltip-able title. "선택 해제" is wired.
// ---------------------------------------------------------------------------

interface BulkActionBarProps {
  count: number;
  onClear: () => void;
}

const BULK_DEFERRED_TITLE = '일괄 작업은 다음 슬라이스에서 제공됩니다';

function BulkActionBar({ count, onClear }: BulkActionBarProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: WAI-ARIA toolbar pattern — there is no native HTML toolbar element; role="toolbar" groups the bulk actions for assistive tech.
    <div
      role="toolbar"
      aria-label="일괄 작업"
      className="flex items-center gap-2 border-b border-border-subtle bg-surface-raised px-4 py-2"
    >
      <span className="text-sm text-text-primary">{count}개 선택됨</span>
      <span className="mx-1 h-4 w-px bg-border-subtle" aria-hidden="true" />
      <Button variant="subtle" size="sm" spacing="compact" disabled title={BULK_DEFERRED_TITLE}>
        <User className="h-3.5 w-3.5" aria-hidden="true" />
        담당자 지정
      </Button>
      <Button variant="subtle" size="sm" spacing="compact" disabled title={BULK_DEFERRED_TITLE}>
        <Flag className="h-3.5 w-3.5" aria-hidden="true" />
        심각도 설정
      </Button>
      <Button variant="subtle" size="sm" spacing="compact" disabled title={BULK_DEFERRED_TITLE}>
        <Layers className="h-3.5 w-3.5" aria-hidden="true" />
        Cluster에 추가
      </Button>
      <Button variant="subtle" size="sm" spacing="compact" disabled title={BULK_DEFERRED_TITLE}>
        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
        Finding 생성
      </Button>
      <div className="flex-1" />
      <Button variant="subtle" size="sm" onClick={onClear} type="button">
        선택 해제
      </Button>
    </div>
  );
}
