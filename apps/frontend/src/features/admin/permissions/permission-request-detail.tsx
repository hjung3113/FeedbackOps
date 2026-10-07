import { GLOSSARY } from '@/lib/copy/glossary';

import {
  Button,
  DetailPanelFullscreenToggle,
  FieldRow,
  OutlineBadge,
  PanelSectionTitle,
} from '@fops/ui';

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
      <header className="flex h-toolbar items-center gap-3 border-b border-border-subtle px-6">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-text-muted">권한 요청</p>
          <p className="truncate text-sm font-medium text-text-primary">
            {actorName ?? GLOSSARY.unknownUser}
            {' · '}
            {getCapabilityDisplayLabel(request.requested_capability)}
          </p>
        </div>
        <OutlineBadge>{permissionRequestStatusLabel[request.status]}</OutlineBadge>
        <div className="flex items-center gap-1">
          <DetailPanelFullscreenToggle />
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="패널 닫기">
            닫기
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            <PanelSectionTitle>요청 정보</PanelSectionTitle>
            <FieldRow label="요청자" inset="none">
              <span className="flex flex-col gap-0.5">
                <span>{actorName ?? GLOSSARY.unknownUser}</span>
                <span className="font-mono text-xs text-text-muted">
                  {shortId(request.requester_actor_id)}
                </span>
              </span>
            </FieldRow>
            <FieldRow label="요청 ID" inset="none">
              <span className="font-mono text-xs text-text-muted">{shortId(request.id)}</span>
            </FieldRow>
            <FieldRow label="요청 권한" inset="none">
              <span className="flex flex-col gap-0.5">
                <span>{getCapabilityDisplayLabel(request.requested_capability)}</span>
                <span className="font-mono text-xs text-text-muted">
                  {request.requested_capability}
                </span>
              </span>
            </FieldRow>
            <FieldRow label="범위" inset="none">
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
            <FieldRow label="요청 만료일" inset="none">
              <span>
                {request.requested_expiration
                  ? formatDateOnly(request.requested_expiration.slice(0, 10))
                  : '만료 없음'}
              </span>
            </FieldRow>
            <FieldRow label="상태" inset="none">
              <OutlineBadge>{permissionRequestStatusLabel[request.status]}</OutlineBadge>
            </FieldRow>
            <FieldRow label="요청 일시" inset="none">
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
