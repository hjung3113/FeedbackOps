import { ROLE_LEVEL_DISPLAY_LABELS } from '@/lib/copy/enum-labels';
import { GLOSSARY } from '@/lib/copy/glossary';

import {
  Button,
  DetailPanelFullscreenToggle,
  FieldRow,
  OutlineBadge,
  PanelSectionTitle,
} from '@fops/ui';
import * as React from 'react';

import { ADMIN_PERMISSIONS_COPY } from '@/lib/copy/admin-permissions';
import { getCapabilityDisplayLabel } from '@/lib/copy/capabilities';
import { formatDateOnly, formatDateTime } from '@/lib/format/datetime';
import { shortId } from '@/lib/identity';
import type { PermissionRequestAdminDetail } from '@fops/shared';

import { PermissionRequestDecisionForm } from './permission-request-decision-form.js';
import { permissionRequestStatusLabel } from './permission-requests-search.js';

export function PermissionRequestDetail({
  request,
  actorName,
  managedSystemName,
  managedSystemNames,
  staleNotice,
  discardedReason,
  onDraftChanged,
  onStaleConflict,
  onDecisionSucceeded,
  onActionPicked,
  onClose,
}: {
  request: PermissionRequestAdminDetail;
  actorName?: string | undefined;
  managedSystemName?: string | undefined;
  managedSystemNames?: Record<string, string> | undefined;
  staleNotice?: boolean;
  discardedReason?: string;
  onDraftChanged?: (draft: { revision: number; nonEmpty: boolean; reason: string }) => void;
  onStaleConflict?: () => void;
  onDecisionSucceeded?: (result: { id: string; revision: number }) => void;
  onActionPicked?: () => void;
  onClose: () => void;
}) {
  const resolvedManagedSystemNames = managedSystemNames ?? {};
  const staleAlertRef = React.useRef<HTMLParagraphElement>(null);
  // Explicit success boundary: a completed review remounts the decision form
  // with a clean draft even when the refetched detail keeps the same revision.
  // ID/revision changes remount via the panel key; unchanged reads never bump
  // the epoch, so an ordinary background refetch preserves the draft.
  const [reviewEpoch, setReviewEpoch] = React.useState(0);
  // Focus follows the latched stale notice, including right after the
  // revision-change remount this panel performs.
  React.useEffect(() => {
    if (staleNotice) staleAlertRef.current?.focus();
  }, [staleNotice]);
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
          {staleNotice ? (
            <p
              ref={staleAlertRef}
              role="alert"
              tabIndex={-1}
              className="text-sm text-accent-danger outline-hidden"
              data-testid="permission-request-stale-alert"
            >
              {ADMIN_PERMISSIONS_COPY.reviewAgain}
            </p>
          ) : null}
          <PermissionRequestRiskReview
            request={request}
            managedSystemNames={resolvedManagedSystemNames}
          />
          <section className="flex flex-col gap-2">
            <PanelSectionTitle>요청 정보</PanelSectionTitle>
            <FieldRow label="요청자" inset="none">
              <span className="flex flex-col gap-0.5">
                <span>{actorName ?? GLOSSARY.unknownUser}</span>
                {actorName ? null : (
                  <span className="font-mono text-xs text-text-muted">
                    {shortId(request.requester_actor_id)}
                  </span>
                )}
              </span>
            </FieldRow>
            <FieldRow label="요청 ID" inset="none">
              <span className="font-mono text-xs text-text-muted">{shortId(request.id)}</span>
            </FieldRow>
            <FieldRow label="요청 권한" inset="none">
              <span>{getCapabilityDisplayLabel(request.requested_capability)}</span>
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
            <FieldRow label="요청 일시" inset="none">
              <span>{formatDateTime(request.created_at)}</span>
            </FieldRow>
          </section>
          <section className="flex flex-col gap-2">
            <PanelSectionTitle>요청 사유</PanelSectionTitle>
            <p className="whitespace-pre-wrap text-sm text-text-primary">{request.reason}</p>
          </section>
          <PermissionRequestDecisionForm
            key={`${request.id}:${request.revision}:${reviewEpoch}`}
            request={request}
            actorName={actorName}
            managedSystemName={managedSystemName}
            {...(staleNotice ? { staleNoticeShown: true } : {})}
            {...(discardedReason !== undefined ? { discardedReason } : {})}
            {...(onDraftChanged ? { onDraftChanged } : {})}
            {...(onStaleConflict ? { onStaleConflict } : {})}
            {...(onDecisionSucceeded ? { onDecisionSucceeded } : {})}
            {...(onActionPicked ? { onActionPicked } : {})}
            onReviewCompleted={() => setReviewEpoch((epoch) => epoch + 1)}
          />
        </div>
      </div>
    </aside>
  );
}

function PermissionRequestRiskReview({
  request,
  managedSystemNames,
}: {
  request: PermissionRequestAdminDetail;
  managedSystemNames: Record<string, string>;
}) {
  const copy = ADMIN_PERMISSIONS_COPY.riskReview;
  const accessDecision = request.effective_access.decision;
  const effectiveDecision = accessDecision.allow
    ? `${copy.allowed} · ${
        accessDecision.via === 'direct_grant'
          ? copy.directGrant
          : accessDecision.via === 'role'
            ? copy.roleAccess
            : copy.managedSystemAccess
      }`
    : copy.accessReasons[accessDecision.reason];

  return (
    <section className="flex flex-col gap-2" data-testid="permission-request-risk-review">
      <PanelSectionTitle>{copy.title}</PanelSectionTitle>
      {request.status !== 'pending' && request.status !== 'needs_more_info' ? (
        <p className="text-sm text-text-muted">{copy.currentState}</p>
      ) : null}
      {request.risk_indicators.length === 0 ? (
        <output className="text-sm text-text-muted">{copy.noSignals}</output>
      ) : (
        <ul className="flex flex-col gap-2">
          {request.risk_indicators.map((indicator, index) => (
            <li className="border-l-2 border-border-subtle pl-3" key={`${indicator.code}:${index}`}>
              <PermissionRiskIndicatorItem
                indicator={indicator}
                managedSystemNames={managedSystemNames}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-1">
        <FieldRow label={copy.requesterRole} inset="none">
          {ROLE_LEVEL_DISPLAY_LABELS[request.requester.role_level]}
        </FieldRow>
        <FieldRow label={copy.effectiveDecision} inset="none">
          {effectiveDecision}
          {request.effective_access.scope.kind === 'all' ||
          request.effective_access.scope.managed_system_ids.length > 0 ? (
            <>
              {' · '}
              {copy.effectiveScope}:{' '}
              {formatEffectiveScope(request.effective_access.scope, managedSystemNames)}
            </>
          ) : null}
          {accessDecision.allow && accessDecision.via === 'direct_grant' ? (
            <>
              {' · '}
              {copy.effectiveGrantScope}:{' '}
              {formatManagedSystemScope(
                request.effective_access.granted_managed_system_id,
                managedSystemNames,
              )}
            </>
          ) : null}
          {accessDecision.allow ? (
            <>
              {' · '}
              {request.effective_access.expires_at
                ? `${copy.expiration} ${formatDateOnly(request.effective_access.expires_at.slice(0, 10))}`
                : copy.noAccessExpiration}
            </>
          ) : null}
        </FieldRow>
        <FieldRow label={copy.reviewAuthority} inset="none">
          {getCapabilityDisplayLabel(request.administrative_authority.capability)} ·{' '}
          {request.administrative_authority.allowed ? copy.allowed : copy.forbidden}
        </FieldRow>
        {request.administrative_authority.is_requester ? (
          <FieldRow label={copy.selfRequest} inset="none">
            {request.administrative_authority.permission_self_approval === 'allowed'
              ? copy.selfApprovalAllowed
              : copy.selfApprovalForbidden}
            {' · '}
            {request.administrative_authority.self_approval_required
              ? copy.selfApprovalReasonRequired
              : copy.selfApprovalReasonOptional}
          </FieldRow>
        ) : null}
      </div>
    </section>
  );
}

function PermissionRiskIndicatorItem({
  indicator,
  managedSystemNames,
}: {
  indicator: PermissionRequestAdminDetail['risk_indicators'][number];
  managedSystemNames: Record<string, string>;
}) {
  const copy = ADMIN_PERMISSIONS_COPY.riskReview;
  switch (indicator.code) {
    case 'sensitive_capability':
      return (
        <p className="text-sm font-medium text-text-primary">
          {copy.sensitiveCapability} · {getCapabilityDisplayLabel(indicator.evidence.capability)}
        </p>
      );
    case 'workspace_scope':
      return <p className="text-sm font-medium text-text-primary">{copy.workspaceScope}</p>;
    case 'no_expiration':
      return <p className="text-sm font-medium text-text-primary">{copy.noExpiration}</p>;
    case 'active_deny':
      return (
        <p className="text-sm font-medium text-text-primary">
          {copy.activeDeny} {indicator.evidence.denies.length}건 ·{' '}
          {indicator.evidence.denies
            .map((deny) => formatManagedSystemScope(deny.managed_system_id, managedSystemNames))
            .join(' · ')}
        </p>
      );
  }
}

function formatManagedSystemScope(
  managedSystemId: string | null,
  managedSystemNames: Record<string, string>,
): string {
  if (managedSystemId === null) return ADMIN_PERMISSIONS_COPY.riskReview.allScope;
  const name = managedSystemNames[managedSystemId];
  return name ? name : `Managed System (${shortId(managedSystemId)})`;
}

function formatEffectiveScope(
  scope: PermissionRequestAdminDetail['effective_access']['scope'],
  managedSystemNames: Record<string, string>,
): string {
  if (scope.kind === 'all') return ADMIN_PERMISSIONS_COPY.riskReview.allScope;
  if (scope.managed_system_ids.length === 0) return ADMIN_PERMISSIONS_COPY.riskReview.noScope;
  return scope.managed_system_ids
    .map((managedSystemId) => formatManagedSystemScope(managedSystemId, managedSystemNames))
    .join(' · ');
}
