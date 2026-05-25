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
 * individual mutations (Assign / Set severity / Add to cluster / Create finding)
 * have no batch endpoint yet, so their buttons are present-but-disabled and the
 * action is deferred to a follow-up issue. "Clear" is fully wired.
 */

import { fetchAnalyticsAreas, fetchManagedSystems } from '@/lib/api';
import type { VocListItem } from '@fops/shared';
import { type AvatarUser, Button, EmptyState } from '@fops/ui';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { FileText, Flag, Layers, User } from 'lucide-react';
import * as React from 'react';
import { useMemo, useState } from 'react';
import type { ResolvedManagedSystem } from '../../hooks/useManagedSystem';
import { useWorkspaceActors } from '../../hooks/useWorkspaceActors';
import { VocRow } from './VocRow';
import { VocRowSkeleton } from './VocRowSkeleton';

// ---------------------------------------------------------------------------
// useManagedSystemMap — lifted map hook
// ---------------------------------------------------------------------------

const COLOR_PALETTE = [
  '#5e6ad2',
  '#27a644',
  '#f2c46d',
  '#8b5cf6',
  '#02b8cc',
  '#ef4444',
  '#e4f222',
  '#7c3aed',
] as const;

function djb2Hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 33) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function colorFromId(id: string): string {
  return COLOR_PALETTE[djb2Hash(id) % COLOR_PALETTE.length] as string;
}

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
        mark: colorFromId(ms.id),
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
  /** Retry handler for error variant. */
  onRetry?: () => void;
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
  onRetry,
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
        title="불러오기 실패"
        body="잠시 후 다시 시도해 주세요."
        action={
          onRetry !== undefined ? (
            <Button onClick={onRetry} type="button">
              다시 시도
            </Button>
          ) : undefined
        }
      />
    );
  }

  // 3. Empty list
  if (!loading && items.length === 0) {
    if (view === 'my') {
      return (
        <EmptyState
          title="내가 제출한 VOC가 없습니다"
          action={
            <Link to="/vocs" search={{ action: 'create' }}>
              + 새 VOC 작성
            </Link>
          }
        />
      );
    }
    // inbox or unspecified
    return (
      <EmptyState
        title="큐가 비었습니다"
        body="제출된 VOC가 표시됩니다."
        action={
          <Link to="/vocs" search={{ action: 'create' }}>
            + 새 VOC 작성
          </Link>
        }
      />
    );
  }

  // 4. Rows (+ bulk-action bar)
  return (
    <div role="rowgroup" aria-label="VOC 목록">
      {checked.size > 0 && <BulkActionBar count={checked.size} onClear={clearChecked} />}
      {items.map((voc) => (
        <VocRow
          key={voc.id}
          voc={voc}
          selected={selectedId === voc.id}
          onSelect={() => {
            onSelect(voc.id);
          }}
          managedSystem={msMap[voc.primary_managed_system_id] ?? null}
          owner={voc.owner_user_id !== null ? (actorMap[voc.owner_user_id] ?? null) : null}
          reporter={actorMap[voc.reporter_id] ?? null}
          areaName={
            voc.analytics_area_id !== null ? (areaMap[voc.analytics_area_id] ?? null) : null
          }
          checked={checked.has(voc.id)}
          onToggleCheck={() => {
            toggleCheck(voc.id);
          }}
        />
      ))}
    </div>
  );
}

VocList.displayName = 'VocList';

// ---------------------------------------------------------------------------
// BulkActionBar — appears when ≥1 row is checked. Mirrors prototype copy:
// "N selected · Assign / Set severity / Add to cluster / Create finding · Clear".
//
// DEFERRED (#89): the four mutating actions have no batch endpoint yet, so they
// are disabled with a tooltip-able title. "Clear" is wired.
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
      <span className="text-sm text-text-primary">{count} selected</span>
      <span className="mx-1 h-4 w-px bg-border-subtle" aria-hidden="true" />
      <Button variant="subtle" size="sm" className="gap-1.5" disabled title={BULK_DEFERRED_TITLE}>
        <User className="h-3.5 w-3.5" aria-hidden="true" />
        Assign
      </Button>
      <Button variant="subtle" size="sm" className="gap-1.5" disabled title={BULK_DEFERRED_TITLE}>
        <Flag className="h-3.5 w-3.5" aria-hidden="true" />
        Set severity
      </Button>
      <Button variant="subtle" size="sm" className="gap-1.5" disabled title={BULK_DEFERRED_TITLE}>
        <Layers className="h-3.5 w-3.5" aria-hidden="true" />
        Add to cluster
      </Button>
      <Button variant="subtle" size="sm" className="gap-1.5" disabled title={BULK_DEFERRED_TITLE}>
        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
        Create finding
      </Button>
      <div className="flex-1" />
      <Button variant="subtle" size="sm" onClick={onClear} type="button">
        Clear
      </Button>
    </div>
  );
}
