import { ListLoadMore } from '@/components/ListLoadMore';
import { ListStateMessage } from '@/components/ListStateMessage';
import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import { formatRecordDocumentTitle, useDocumentTitle } from '@/lib/router/document-title';
import { ListShell, ListToolbar, PermissionBlockedPanel, useListMotion } from '@fops/ui';
import { useState } from 'react';

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
}: {
  selectedParam?: string | undefined;
  managedSystem?: string;
}) {
  const listMotion = useListMotion();
  const queue = useTaskRequestsQueue({ selectedParam, managedSystem });
  const context = JSON.stringify([queue.activeTab, managedSystem ?? null]);
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

  if (queue.isLoading) {
    return <div className="p-4 text-sm text-text-muted">Task Request을 불러오는 중…</div>;
  }

  if (queue.permissionDeniedError) {
    return (
      <PermissionBlockedPanel
        state="denied"
        category="Task Request queue"
        reason={PERMISSION_BLOCKED_REASONS.taskRequestQueue}
        className="m-4"
      />
    );
  }
  if (queue.hasError) {
    return (
      <ListStateMessage
        variant="error"
        title="Task Request 목록을 불러오지 못했습니다"
        body="잠시 후 다시 시도하세요."
        action={{ label: '다시 시도', onClick: queue.refetch }}
      />
    );
  }

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
        </>
      }
      detailPanel={
        queue.selected ? (
          <TaskRequestPanel
            item={queue.selected}
            names={queue.names}
            currentActorId={queue.currentActorId}
            currentRole={queue.currentRole}
            onClose={() => queue.setSelectedId(null)}
            onDecisionComplete={queue.onDecisionComplete}
          />
        ) : null
      }
    />
  );
}
