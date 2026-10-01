import { Button, FieldRow, OutlineBadge, PanelSectionTitle } from '@fops/ui';

import type { AdminPermissionRequestRow } from '@/lib/api';
import { getCapabilityDisplayLabel } from '@/lib/copy/capabilities';
import { formatDateOnly, formatDateTime } from '@/lib/format/datetime';
import { shortId } from '@/lib/identity';

import { PermissionRequestDecisionForm } from './permission-request-decision-form.js';
import { permissionRequestStatusLabel } from './permission-requests-search.js';

export function PermissionRequestDetail({
  request,
  actorName,
  managedSystemName,
  onClose,
}: {
  request: AdminPermissionRequestRow;
  actorName?: string | undefined;
  managedSystemName?: string | undefined;
  onClose: () => void;
}) {
  return (
    <aside
      className="flex h-full min-h-0 flex-col bg-surface-detail"
      data-testid="permission-request-detail-panel"
    >
      <header className="flex h-[50px] items-center gap-3 border-b border-border-subtle px-6">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-text-muted">Permission Request</p>
          <p className="truncate text-sm font-medium text-text-primary">
            {actorName ?? '알 수 없는 사용자'}
            {' · '}
            {getCapabilityDisplayLabel(request.requested_capability)}
          </p>
        </div>
        <OutlineBadge>{permissionRequestStatusLabel[request.status]}</OutlineBadge>
        <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="패널 닫기">
          닫기
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            <PanelSectionTitle>요청 정보</PanelSectionTitle>
            <FieldRow label="요청자" className="px-0">
              <span className="flex flex-col gap-0.5">
                <span>{actorName ?? '알 수 없는 사용자'}</span>
                <span className="font-mono text-xs text-text-muted">
                  {shortId(request.requester_actor_id)}
                </span>
              </span>
            </FieldRow>
            <FieldRow label="요청 ID" className="px-0">
              <span className="font-mono text-xs text-text-muted">{shortId(request.id)}</span>
            </FieldRow>
            <FieldRow label="요청 권한" className="px-0">
              <span className="flex flex-col gap-0.5">
                <span>{getCapabilityDisplayLabel(request.requested_capability)}</span>
                <span className="font-mono text-xs text-text-muted">
                  {request.requested_capability}
                </span>
              </span>
            </FieldRow>
            <FieldRow label="범위" className="px-0">
              <span className="flex flex-col gap-0.5">
                <span>
                  {request.requested_managed_system_id
                    ? (managedSystemName ?? 'Managed System')
                    : '워크스페이스 전체'}
                </span>
                {request.requested_managed_system_id && !managedSystemName && (
                  <span className="font-mono text-xs text-text-muted">
                    {shortId(request.requested_managed_system_id)}
                  </span>
                )}
              </span>
            </FieldRow>
            <FieldRow label="요청 만료일" className="px-0">
              <span>
                {request.requested_expiration
                  ? formatDateOnly(request.requested_expiration.slice(0, 10))
                  : '만료 없음'}
              </span>
            </FieldRow>
            <FieldRow label="상태" className="px-0">
              <OutlineBadge>{permissionRequestStatusLabel[request.status]}</OutlineBadge>
            </FieldRow>
            <FieldRow label="요청 일시" className="px-0">
              <span>{formatDateTime(request.created_at)}</span>
            </FieldRow>
          </section>
          <section className="flex flex-col gap-2">
            <PanelSectionTitle>요청 사유</PanelSectionTitle>
            <p className="whitespace-pre-wrap text-sm text-text-primary">{request.reason}</p>
          </section>
          <PermissionRequestDecisionForm
            key={request.id}
            request={request}
            managedSystemName={managedSystemName}
          />
        </div>
      </div>
    </aside>
  );
}
