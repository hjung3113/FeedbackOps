import { Button, FieldRow, OutlineBadge, PanelSectionTitle } from '@fops/ui';

import type { AdminPermissionRequestRow } from '@/lib/api';

import { PermissionRequestDecisionForm } from './permission-request-decision-form.js';
import {
  formatPermissionRequestDate,
  permissionRequestStatusLabel,
} from './permission-requests-search.js';

export function PermissionRequestDetail({
  request,
  actorName,
  onClose,
}: {
  request: AdminPermissionRequestRow;
  actorName?: string | undefined;
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
          <p className="font-mono text-sm text-text-primary">{request.id.slice(0, 8)}</p>
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
                <span>{actorName ?? 'Unknown requester'}</span>
                <span className="font-mono text-xs text-text-muted">
                  {request.requester_actor_id}
                </span>
              </span>
            </FieldRow>
            <FieldRow label="요청 권한" className="px-0">
              <span>{request.requested_capability}</span>
            </FieldRow>
            <FieldRow label="범위" className="px-0">
              <span>{request.requested_managed_system_id ?? '워크스페이스 전체'}</span>
            </FieldRow>
            <FieldRow label="상태" className="px-0">
              <OutlineBadge>{permissionRequestStatusLabel[request.status]}</OutlineBadge>
            </FieldRow>
            <FieldRow label="요청 일시" className="px-0">
              <span>{formatPermissionRequestDate(request.created_at)}</span>
            </FieldRow>
          </section>
          <section className="flex flex-col gap-2">
            <PanelSectionTitle>요청 사유</PanelSectionTitle>
            <p className="whitespace-pre-wrap text-sm text-text-primary">{request.reason}</p>
          </section>
          <PermissionRequestDecisionForm request={request} />
        </div>
      </div>
    </aside>
  );
}
