import { ListStateMessage } from '@/components/ListStateMessage';
import { ListShell, ListTabs, type ListToolbarTab, ObjectRow, OutlineBadge } from '@fops/ui';

import type { AdminPermissionRequestRow } from '@/lib/api';
import { getCapabilityDisplayLabel } from '@/lib/copy/capabilities';
import { formatDateOnly, formatDateTime } from '@/lib/format/datetime';
import { shortId } from '@/lib/identity';

import { PermissionRequestDetail } from './permission-request-detail.js';
import {
  permissionRequestStatusLabel,
  permissionRequestTabs,
} from './permission-requests-search.js';
import { usePermissionRequestsConsole } from './use-permission-requests-console.js';

const PERMISSION_REQUESTS_PANEL_ID = 'permission-requests-list-panel';

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
  // #706 — counts are unknown until the requests read succeeds (covers
  // pending, error, and refetch-after-error without data); unknown must never
  // render as 0 (ListTabs renders badgeCount only when set).
  const countsKnown = !isPending && !isError;
  const tabs: ListToolbarTab[] = permissionRequestTabs.map((tab) => ({
    value: tab.value,
    label: tab.label,
    id: `permission-request-tab-${tab.value}`,
    controlsId: PERMISSION_REQUESTS_PANEL_ID,
    ...(countsKnown
      ? {
          badgeCount:
            tab.value === 'all'
              ? allRequests.length
              : allRequests.filter((request) => request.status === tab.value).length,
        }
      : {}),
  }));

  return (
    <ListShell
      toolbar={{
        title: '권한 요청 검토',
        subtitle: '워크스페이스 권한 요청을 검토하고 결정합니다.',
      }}
      tabs={
        <ListTabs
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={(next) => handleTabChange(next as typeof activeTab)}
          ariaLabel="권한 요청 상태"
        />
      }
      list={
        <section
          id={PERMISSION_REQUESTS_PANEL_ID}
          role="tabpanel"
          aria-labelledby={`permission-request-tab-${activeTab}`}
          data-testid="permission-requests-list"
        >
          {isPending ? (
            <p className="p-6 text-sm text-text-muted">권한 요청을 불러오는 중입니다.</p>
          ) : null}
          {isError ? (
            <p className="p-6 text-sm text-accent-danger">권한 요청을 불러오지 못했습니다.</p>
          ) : null}
          {!isPending && !isError && visibleRequests.length === 0 ? (
            <ListStateMessage variant="empty" title="표시할 요청이 없습니다." />
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
      title={`${actorName ?? GLOSSARY.unknownUser} · ${getCapabilityDisplayLabel(request.requested_capability)}`}
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
          <span>{formatDateTime(request.created_at)}</span>
          {request.requested_expiration ? (
            <>
              <span>·</span>
              {/* #590 adds a compact row hint; the prototype shows the full date in detail. */}
              <span>만료 {formatDateOnly(request.requested_expiration.slice(0, 10))}</span>
            </>
          ) : null}
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
import { GLOSSARY } from '@/lib/copy/glossary';
