/**
 * VocList — composes VOC rows with loading / empty / error states (mirrors
 * docs/design-prototype/screen-voc.jsx `VocList`).
 *
 * LIFTED MAP HOOKS: per-row lookups (managed system, actor identity for
 * owner/reporter, analytics-area name) are resolved by single map queries at
 * the VocList level and passed to each VocRow via props. This avoids calling
 * hooks inside .map() and keeps fetch count constant regardless of row count.
 *
 * There is no bulk selection: no batch VOC endpoint exists (deferred, see
 * docs/design/14-post-mvp-backlog.md Slice 62).
 */

import { ListStateMessage } from '@/components/ListStateMessage';
import { fetchAnalyticsAreas, fetchManagedSystems } from '@/lib/api';
import {
  VOC_AREA_FILTER_EMPTY_COPY,
  VOC_LIST_LOAD_ERROR_LABELS,
  VOC_SEARCH_EMPTY_LABEL,
} from '@/lib/copy/voc';
import type { ResolvedManagedSystem } from '@/lib/cross-system/useManagedSystem';
import { usePermissionCheck } from '@/lib/cross-system/usePermissionCheck';
import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import type { VocListItem } from '@fops/shared';
import { type AvatarUser, Button, EmptyState, managedSystemMarkColor } from '@fops/ui';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useMemo } from 'react';
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
  areaFiltered?: boolean;
  areaLabel?: string;
  /** Retry handler for error variant. */
  onRetry?: () => void;
  /** Opens the route-owned VOC create flow from an empty list state. */
  onCreate?: () => void;
  /** Neutralizes the unassigned cue for the Inbox unassigned tab. */
  unassignedBadgeTone?: 'danger' | 'neutral';
}

const SKELETON_COUNT = 10;

// ---------------------------------------------------------------------------
// VocList
// ---------------------------------------------------------------------------

export function VocList(props: VocListProps) {
  const retryFocusTarget = React.useRef<HTMLElement>(null);
  return (
    <section ref={retryFocusTarget} aria-label="VOC 목록" tabIndex={-1}>
      <VocListContent
        {...props}
        {...(props.onRetry !== undefined
          ? {
              onRetry: () => {
                retryFocusTarget.current?.focus();
                props.onRetry?.();
              },
            }
          : {})}
      />
    </section>
  );
}

function VocListContent({
  items,
  loading,
  error,
  selectedId,
  onSelect,
  view,
  searching,
  areaFiltered,
  areaLabel,
  onRetry,
  onCreate,
  unassignedBadgeTone,
}: VocListProps) {
  const msMap = useManagedSystemMap();
  const areaMap = useAnalyticsAreaMap();
  const actorMap = useActorMap();

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
      <div role="alert">
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
      </div>
    );
  }

  // 3. Empty list
  if (!loading && items.length === 0) {
    if (view === 'inbox' && areaFiltered && areaLabel !== undefined) {
      return (
        <ListStateMessage
          variant="filtered"
          title={VOC_AREA_FILTER_EMPTY_COPY.title}
          body={VOC_AREA_FILTER_EMPTY_COPY.body(areaLabel)}
        />
      );
    }
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

  // 4. Rows
  return (
    <div role="rowgroup" aria-label="VOC 목록">
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
          ...(unassignedBadgeTone !== undefined ? { unassignedBadgeTone } : {}),
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
