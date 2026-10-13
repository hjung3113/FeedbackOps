import { ListLoadMore } from '@/components/ListLoadMore';
import { ListStateMessage } from '@/components/ListStateMessage';
import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import { TASK_REQUEST_LINK_MISSING_MESSAGE } from '@/lib/copy/task-requests';
import { RESPONSIBILITY_COPY } from '@/lib/copy/tasks';
import { formatRecordDocumentTitle, useDocumentTitle } from '@/lib/router/document-title';
import { Button, FieldLabel, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@fops/ui';
import { ListShell, ListToolbar, PermissionBlockedPanel, useListMotion } from '@fops/ui';
import { useEffect, useState } from 'react';

import { LinkTargetMissingNotice } from '../components/LinkTargetMissingNotice';
import { useCloseFocusReturn } from '../hooks/useCloseFocusReturn';
import { TaskRequestPanel } from './task-requests/TaskRequestPanel';
import { TaskRequestRow } from './task-requests/TaskRequestRow';
import { type TaskRequestTab, useTaskRequestsQueue } from './task-requests/useTaskRequestsQueue';

export {
  canApproveTaskRequest,
  canConvertTaskRequest,
  canLinkExistingTaskRequest,
  canRejectTaskRequest,
  canRequestEvidenceForTaskRequest,
} from './task-requests/predicates';

export function TaskRequestsRoute({
  selectedParam,
  managedSystem,
  reviewer,
  reviewerTeam,
  onReviewerChange,
  onSelectionChange,
}: {
  reviewer?: string;
  reviewerTeam?: string;
  onReviewerChange?: (reviewer: string | undefined, team: string | undefined) => void;
  selectedParam?: string | undefined;
  managedSystem?: string;
  onSelectionChange?: (id: string | null, replace: boolean) => void;
}) {
  const listMotion = useListMotion();
  const [localFilter, setLocalFilter] = useState<{ reviewer?: string; team?: string }>({});
  const activeReviewer = onReviewerChange ? reviewer : localFilter.reviewer;
  const activeTeam = onReviewerChange ? reviewerTeam : localFilter.team;
  const [filterMode, setFilterMode] = useState<'actor' | 'team' | null>(null);
  const [filterId, setFilterId] = useState('');
  const changeReviewer = (actor: string | undefined, team: string | undefined) => {
    if (onReviewerChange) onReviewerChange(actor, team);
    else setLocalFilter({ ...(actor ? { reviewer: actor } : {}), ...(team ? { team } : {}) });
  };
  const queue = useTaskRequestsQueue({
    selectedParam,
    managedSystem,
    reviewer: activeReviewer,
    reviewerTeam: activeTeam,
    onSelectionChange,
  });
  const context = JSON.stringify([
    queue.activeTab,
    managedSystem ?? null,
    activeReviewer,
    activeTeam,
  ]);
  const { rowRef, returnFocus, cancel } = useCloseFocusReturn(context);
  const [settlement, setSettlement] = useState({ context, settled: queue.queueSettled });
  const settledOnce = queue.queueSettled || (settlement.context === context && settlement.settled);
  // First fresh data replaces the cached boundary; later fetches keep its motion and scroll.
  if (settlement.context !== context || settlement.settled !== settledOnce) {
    setSettlement({ context, settled: settledOnce });
  }
  const phase = !settledOnce ? 'cached' : queue.shown.length === 0 ? 'empty' : 'rows';
  const selectedDocumentTitle =
    !queue.isLoading &&
    !queue.hasError &&
    queue.selected !== null &&
    queue.selectedId === queue.selected.id
      ? formatRecordDocumentTitle({
          displayId: queue.selected.display_id,
          title: queue.selected.requested_outcome,
        })
      : null;
  useDocumentTitle(selectedDocumentTitle);

  // #1032: a new selection (row click or URL param) cancels a pending focus return.
  useEffect(() => {
    if (queue.selectedId !== null) cancel();
  }, [queue.selectedId, cancel]);

  const activeTabLabel =
    queue.tabs.find((tab) => tab.value === queue.activeTab)?.label ?? queue.activeTab;
  const isPendingEmpty =
    queue.shown.length === 0 && queue.hasItems && queue.activeTab === 'pending_review';
  const isFilteredEmpty =
    queue.shown.length === 0 &&
    queue.hasItems &&
    queue.activeTab !== 'pending_review' &&
    queue.activeTab !== 'all';

  return (
    <ListShell
      list={
        <>
          <ListToolbar
            tabs={queue.tabs}
            activeTab={queue.activeTab}
            onTabChange={(next) => queue.setActiveTab(next as TaskRequestTab)}
          />
          <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-2">
            <Select
              value={
                filterMode ??
                (activeTeam
                  ? 'team'
                  : activeReviewer === 'me'
                    ? 'me'
                    : activeReviewer
                      ? 'actor'
                      : 'all')
              }
              onValueChange={(value) => {
                setFilterMode(value === 'actor' || value === 'team' ? value : null);
                setFilterId('');
                if (value === 'all' || value === 'me')
                  changeReviewer(value === 'me' ? 'me' : undefined, undefined);
              }}
            >
              <SelectTrigger aria-label="검토자 필터">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{RESPONSIBILITY_COPY.allReviewers}</SelectItem>
                <SelectItem value="me">{RESPONSIBILITY_COPY.mine}</SelectItem>
                <SelectItem value="actor">{RESPONSIBILITY_COPY.modes.actor}</SelectItem>
                <SelectItem value="team">{RESPONSIBILITY_COPY.modes.team}</SelectItem>
              </SelectContent>
            </Select>
            {(filterMode || activeTeam || (activeReviewer && activeReviewer !== 'me')) && (
              <form
                className="flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const mode = filterMode ?? (activeTeam ? 'team' : 'actor');
                  const id = filterId.trim();
                  if (id)
                    changeReviewer(
                      mode === 'actor' ? id : undefined,
                      mode === 'team' ? id : undefined,
                    );
                }}
              >
                <FieldLabel htmlFor="reviewer-filter-id">
                  {(filterMode ?? (activeTeam ? 'team' : 'actor')) === 'team'
                    ? RESPONSIBILITY_COPY.teamId
                    : RESPONSIBILITY_COPY.actorId}
                </FieldLabel>
                <input
                  id="reviewer-filter-id"
                  value={
                    filterId || (filterMode === null ? (activeTeam ?? activeReviewer ?? '') : '')
                  }
                  onChange={(event) => setFilterId(event.target.value)}
                  className="rounded border border-border-subtle bg-surface-detail px-2 py-1 text-sm"
                />
                <Button type="submit" size="sm">
                  적용
                </Button>
              </form>
            )}
          </div>
          {queue.isLoading ? (
            <div className="p-4 text-sm text-text-muted">Task Request을 불러오는 중…</div>
          ) : queue.permissionDeniedError ? (
            <PermissionBlockedPanel
              state="denied"
              category="Task Request queue"
              reason={PERMISSION_BLOCKED_REASONS.taskRequestQueue}
              className="m-4"
            />
          ) : queue.hasError ? (
            <ListStateMessage
              variant="error"
              title="Task Request 목록을 불러오지 못했습니다"
              body="잠시 후 다시 시도하세요."
              action={{ label: '다시 시도', onClick: queue.refetch }}
            />
          ) : (
            <div
              key={JSON.stringify([context, phase])}
              ref={listMotion}
              className="min-h-0 flex-1 overflow-y-auto"
            >
              {queue.shown.map((item) => (
                <TaskRequestRow
                  key={item.id}
                  item={item}
                  selected={queue.selected?.id === item.id}
                  names={queue.names}
                  onSelect={queue.setSelectedId}
                  rowRef={rowRef(item.id)}
                />
              ))}
              <ListLoadMore
                hasMore={queue.hasMore}
                loadingMore={queue.loadingMore}
                failed={queue.loadMoreError}
                onLoadMore={queue.loadMore}
              />
              {queue.shown.length === 0 &&
                (isPendingEmpty ? (
                  <ListStateMessage
                    variant="filtered"
                    title="검토 대기 중인 Task Request가 없습니다"
                    body="다른 상태의 Task Request가 있습니다."
                  />
                ) : isFilteredEmpty ? (
                  <ListStateMessage
                    variant="filtered"
                    title="현재 조건에 맞는 Task Request가 없습니다"
                    body={`선택한 상태: ${activeTabLabel}`}
                    action={{
                      label: '필터 초기화',
                      onClick: () => queue.setActiveTab('pending_review'),
                    }}
                  />
                ) : (
                  <ListStateMessage
                    variant="empty"
                    title="Task Request가 없습니다."
                    body="검토 요청이 접수되면 이 목록에 표시됩니다."
                  />
                ))}
            </div>
          )}
        </>
      }
      detailPanel={
        queue.hasError ? null : queue.linkMissing ? (
          <LinkTargetMissingNotice message={TASK_REQUEST_LINK_MISSING_MESSAGE} />
        ) : queue.selected ? (
          <TaskRequestPanel
            key={queue.selected.id}
            item={queue.selected}
            names={queue.names}
            currentActorId={queue.currentActorId}
            currentRole={queue.currentRole}
            onClose={() => {
              if (queue.selectedId !== null) returnFocus(queue.selectedId);
              queue.setSelectedId(null);
            }}
            onDecisionComplete={queue.onDecisionComplete}
          />
        ) : null
      }
    />
  );
}
