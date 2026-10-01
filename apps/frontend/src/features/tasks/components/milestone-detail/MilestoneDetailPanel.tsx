import { getMilestone } from '@/lib/api/milestones';
import { isPermissionDenied } from '@/lib/api/types';
import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import { formatRecordDocumentTitle, useDocumentTitle } from '@/lib/router/document-title';
import {
  DetailPanelHeader,
  DetailPanelHeaderActions,
  DirtyConfirmation,
  PermissionBlockedPanel,
} from '@fops/ui';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { MilestoneDetailContent } from './MilestoneDetailContent';

// #514 B2d — Milestone detail panel mirroring MilestoneDetailPanel in
// docs/design-prototype/screen-milestones.jsx, mounted in the existing
// ListShell detail slot (never a new shell).
// Timeline section is deliberately omitted: Timeline is Slice C (TaskGantt).
export interface MilestoneDetailPanelProps {
  milestoneId: string;
  onClose: () => void;
  actorNamesById: ReadonlyMap<string, string>;
  managedSystemNamesById: ReadonlyMap<string, string>;
  analyticsAreaNamesById: ReadonlyMap<string, string>;
  /** R3 — reports whether a title draft is unsaved, so the route can run the
      discard confirmation before a record switch, New milestone, or a URL
      param change replaces the panel. */
  onTitleDirtyChange?: (dirty: boolean) => void;
}

export function MilestoneDetailPanel({
  milestoneId,
  onClose,
  actorNamesById,
  managedSystemNamesById,
  analyticsAreaNamesById,
  onTitleDirtyChange,
}: MilestoneDetailPanelProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const milestoneQuery = useQuery({
    queryKey: ['milestone', milestoneId] as const,
    queryFn: ({ signal }) => getMilestone(milestoneId, signal),
    staleTime: 30 * 1000,
  });
  useDocumentTitle(
    milestoneQuery.isSuccess &&
      !milestoneQuery.isFetching &&
      milestoneQuery.data?.id === milestoneId
      ? formatRecordDocumentTitle({
          displayId: milestoneQuery.data.display_id,
          title: milestoneQuery.data.title,
        })
      : null,
  );
  const error = milestoneQuery.error;
  // React Query keeps the last success when a refetch fails, and exposes both
  // data and error. A settled read error is the detail permission contract:
  // hide retained identity, record actions, and body. Do not clear the cache.
  const milestone = error == null ? milestoneQuery.data : undefined;

  // B2e fixup — a dirty title edit confirms before the header close discards
  // it (ui-design-system: "Dirty forms warn before close"). Clean, loading,
  // and failed-read states keep closing immediately. R3 — the same dirty
  // state is also reported upward so the route can confirm record switches.
  const [titleDirty, setTitleDirty] = React.useState(false);
  const handleTitleDirtyChange = React.useCallback(
    (dirty: boolean) => {
      setTitleDirty(dirty);
      onTitleDirtyChange?.(dirty);
    },
    [onTitleDirtyChange],
  );
  const [discardTitleOpen, setDiscardTitleOpen] = React.useState(false);

  function handleHeaderClose(): void {
    if (titleDirty) {
      setDiscardTitleOpen(true);
      return;
    }
    onClose();
  }

  return (
    <aside className="flex h-full flex-col bg-surface-detail">
      {/* Panel chrome first: header and close stay mounted independently of the
          query result, so pending, denied, and unavailable reads all stay
          dismissible. Identity and record actions render only for a successful
          read with no terminal error — never for cached data after 403/404. */}
      <DetailPanelHeader
        kind="milestone"
        onClose={handleHeaderClose}
        {...(milestone !== undefined
          ? {
              id: milestone.display_id,
              extras: (
                <DetailPanelHeaderActions
                  entityKind="milestone"
                  entityId={milestone.id}
                  copyUrl={`/tasks?view=milestones&param=${milestone.id}`}
                />
              ),
            }
          : {})}
      />
      {milestone === undefined ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {milestoneQuery.isLoading ? (
            <div className="p-4 text-sm text-text-muted">Loading Milestone…</div>
          ) : error !== null && isPermissionDenied(error) ? (
            <PermissionBlockedPanel
              state="denied"
              category="Milestone 상세"
              reason={PERMISSION_BLOCKED_REASONS.milestoneDetail}
              className="m-4"
            />
          ) : (
            <div className="p-4 text-sm text-accent-danger">Milestone 상세를 불러오지 못했습니다.</div>
          )}
        </div>
      ) : (
        <MilestoneDetailContent
          // B2e fixup — editor state is per record: the keyed remount drops
          // editingTitle/titleDraft when the selected milestone changes, so a
          // cached destination can never inherit another record's draft.
          key={milestone.id}
          milestone={milestone}
          scrollRef={scrollRef}
          actorNamesById={actorNamesById}
          managedSystemNamesById={managedSystemNamesById}
          analyticsAreaNamesById={analyticsAreaNamesById}
          onTitleDirtyChange={handleTitleDirtyChange}
        />
      )}
      <DirtyConfirmation
        open={discardTitleOpen}
        onConfirm={() => {
          setDiscardTitleOpen(false);
          setTitleDirty(false);
          onClose();
        }}
        onCancel={() => setDiscardTitleOpen(false)}
      />
    </aside>
  );
}
