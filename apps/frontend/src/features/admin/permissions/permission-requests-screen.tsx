import { Button, ListShell, ObjectRow, OutlineBadge } from '@fops/ui';

import type { AdminPermissionRequestRow } from '@/lib/api';
import { getCapabilityDisplayLabel } from '@/lib/copy/capabilities';
import { shortId } from '@/lib/identity';

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
    managedSystemNames,
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
              managedSystemName={
                request.requested_managed_system_id
                  ? managedSystemNames[request.requested_managed_system_id]
                  : undefined
              }
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
            managedSystemName={
              selected.requested_managed_system_id
                ? managedSystemNames[selected.requested_managed_system_id]
                : undefined
            }
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
  managedSystemName,
  selected,
  onSelect,
}: {
  request: AdminPermissionRequestRow;
  actorName?: string | undefined;
  managedSystemName?: string | undefined;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <ObjectRow
      id="권한 요청"
      title={`${actorName ?? '알 수 없는 사용자'} · ${getCapabilityDisplayLabel(request.requested_capability)}`}
      selected={selected}
      onClick={onSelect}
      badges={<OutlineBadge>{permissionRequestStatusLabel[request.status]}</OutlineBadge>}
      meta={
        <>
          <span className="font-mono text-text-muted">{request.requested_capability}</span>
          <span>·</span>
          <span>
            {request.requested_managed_system_id
              ? (managedSystemName ?? 'Managed System')
              : '워크스페이스 전체'}
          </span>
          {request.requested_managed_system_id && !managedSystemName && (
            <span className="font-mono text-text-muted">
              {shortId(request.requested_managed_system_id)}
            </span>
          )}
          <span>·</span>
          <span>{formatPermissionRequestDate(request.created_at)}</span>
          <span>·</span>
          <span className="font-mono text-text-muted">{shortId(request.id)}</span>
        </>
      }
      trailing={
        !actorName && (
          <span className="text-right text-xs text-text-muted">
            <span className="font-mono">{shortId(request.requester_actor_id)}</span>
          </span>
        )
      }
    />
  );
}
