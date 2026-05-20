/**
 * VocList — composes VOC rows with loading / empty / error states.
 *
 * PER-ROW HOOK STRATEGY: we use the "lifted map hook" pattern instead of
 * calling useManagedSystem inside .map(). We call useManagedSystemMap() once
 * at the VocList level; it returns Record<id, ResolvedManagedSystem> backed by
 * the same ['managed-systems','all'] cache key. Each VocRow receives its
 * resolved MS via a prop. This avoids any rules-of-hooks concern and makes
 * exactly one query regardless of row count.
 */

import * as React from 'react';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { VocListItem } from '@fops/shared';
import { Button, EmptyState } from '@fops/ui';
import { fetchManagedSystems } from '@/lib/api';
import type { ResolvedManagedSystem } from '../../hooks/useManagedSystem';
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
            <Button onClick={onRetry} type="button">다시 시도</Button>
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

  // 4. Rows
  return (
    <div role="rowgroup" aria-label="VOC 목록">
      {items.map((voc) => (
        <VocRow
          key={voc.id}
          voc={voc}
          selected={selectedId === voc.id}
          onSelect={() => { onSelect(voc.id); }}
          managedSystem={msMap[voc.primary_managed_system_id] ?? null}
        />
      ))}
    </div>
  );
}

VocList.displayName = 'VocList';
