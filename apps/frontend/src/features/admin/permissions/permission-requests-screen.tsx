import { Button, ListShell, ObjectRow, OutlineBadge } from '@fops/ui';

import type { AdminPermissionRequestRow } from '@/lib/api';

import { PermissionRequestDetail } from './permission-request-detail.js';
import {
  formatPermissionRequestDate,
  permissionRequestStatusLabel,
  permissionRequestTabs,
} from './permission-requests-search.js';
import { usePermissionRequestsConsole } from './use-permission-requests-console.js';

export function PermissionRequestsScreen() {
  const {
    allRequests,
    visibleRequests,
    activeTab,
    selected,
    selectedId,
    actorNames,
    isPending,
    isError,
    handleTabChange,
    handleSelect,
    handleClose,
  } = usePermissionRequestsConsole();

  return (
    <ListShell
      toolbar={{
        title: '권한 요청 검토',
        subtitle: '워크스페이스 권한 요청을 검토하고 결정합니다.',
      }}
      tabs={
        <div className="flex items-center gap-1" role="tablist" aria-label="권한 요청 상태">
          {permissionRequestTabs.map((tab) => {
            const count =
              tab.value === 'all'
                ? allRequests.length
                : allRequests.filter((request) => request.status === tab.value).length;

            return (
              <Button
                key={tab.value}
                type="button"
                variant={activeTab === tab.value ? 'secondary' : 'ghost'}
                size="sm"
                role="tab"
                aria-selected={activeTab === tab.value}
                onClick={() => handleTabChange(tab.value)}
              >
                {tab.label} ({count})
              </Button>
            );
          })}
        </div>
      }
      list={
        <section
          role="tabpanel"
          aria-label={`${permissionRequestTabs.find((tab) => tab.value === activeTab)?.label} 요청`}
          data-testid="permission-requests-list"
        >
          {isPending ? (
            <p className="p-6 text-sm text-text-muted">권한 요청을 불러오는 중입니다.</p>
          ) : null}
          {isError ? (
            <p className="p-6 text-sm text-accent-danger">권한 요청을 불러오지 못했습니다.</p>
          ) : null}
          {!isPending && !isError && visibleRequests.length === 0 ? (
            <p className="p-6 text-sm text-text-muted">표시할 권한 요청이 없습니다.</p>
          ) : null}
          {visibleRequests.map((request) => (
            <PermissionRequestRow
              key={request.id}
              request={request}
              actorName={actorNames[request.requester_actor_id]}
              selected={selectedId === request.id}
              onSelect={() => handleSelect(request.id)}
            />
          ))}
        </section>
      }
      detailPanel={
        selected ? (
          <PermissionRequestDetail
            request={selected}
            actorName={actorNames[selected.requester_actor_id]}
            onClose={handleClose}
          />
        ) : undefined
      }
    />
  );
}

function PermissionRequestRow({
  request,
  actorName,
  selected,
  onSelect,
}: {
  request: AdminPermissionRequestRow;
  actorName?: string | undefined;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <ObjectRow
      id={request.id.slice(0, 8)}
      title={request.requested_capability}
      selected={selected}
      onClick={onSelect}
      badges={<OutlineBadge>{permissionRequestStatusLabel[request.status]}</OutlineBadge>}
      meta={
        <>
          <span>{request.requested_managed_system_id ?? '워크스페이스 전체'}</span>
          <span>·</span>
          <span>{formatPermissionRequestDate(request.created_at)}</span>
        </>
      }
      trailing={
        <span className="text-right text-xs text-text-muted">
          <span className="block text-text-primary">{actorName ?? 'Unknown requester'}</span>
          <span className="font-mono">{request.requester_actor_id.slice(0, 8)}</span>
        </span>
      }
    />
  );
}
