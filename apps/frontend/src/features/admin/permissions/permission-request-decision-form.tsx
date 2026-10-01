import { isCapability, isSensitiveCapability } from '@fops/shared';
import {
  Button,
  DatePicker,
  Input,
  OutlineBadge,
  PanelSectionTitle,
  RadioGroup,
  RadioGroupItem,
  Textarea,
} from '@fops/ui';
import * as React from 'react';

import { type PermissionRequestDecisionAction, useIdempotencyKey } from '@/lib/api';
import type { AdminPermissionRequestRow } from '@/lib/api';
import { useMe } from '@/lib/auth/useMe';
import { formatDateOnly } from '@/lib/format/datetime';
import { shortId } from '@/lib/identity';

import { useWorkspaceSettings } from '../settings/use-workspace-settings.js';
import { useDecidePermissionRequest } from './useDecidePermissionRequest.js';

const ACTIONS: Array<{
  value: PermissionRequestDecisionAction;
  label: string;
  needsReason: boolean;
}> = [
  { value: 'approve', label: '승인', needsReason: false },
  { value: 'need-more-info', label: '추가 정보 요청', needsReason: true },
  { value: 'reject', label: '거절', needsReason: true },
  { value: 'deny', label: '명시적 거부', needsReason: true },
];

type ApprovalExpirationMode = 'keep' | 'change' | 'clear';

const APPROVAL_EXPIRATION_ERROR = '만료일은 현재 시각보다 이후여야 합니다.';

function localDateInputValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function isFutureApprovalExpiration(date: string, now = Date.now()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;

  const deadline = new Date(`${date}T23:59:59.000Z`);
  return (
    Number.isFinite(deadline.getTime()) &&
    deadline.toISOString().slice(0, 10) === date &&
    deadline.getTime() > now
  );
}

function hasExpirationFieldError(error: unknown): boolean {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('code' in error) ||
    error.code !== 'validation.failed' ||
    !('detail' in error)
  ) {
    return false;
  }

  const detail = error.detail;
  if (typeof detail !== 'object' || detail === null || !('fields' in detail)) return false;

  const fields = detail.fields;
  return (
    Array.isArray(fields) &&
    fields.some(
      (field: unknown) =>
        typeof field === 'object' &&
        field !== null &&
        'path' in field &&
        Array.isArray(field.path) &&
        field.path.includes('expiration'),
    )
  );
}

export function PermissionRequestDecisionForm({
  request,
  managedSystemName,
}: {
  request: AdminPermissionRequestRow;
  managedSystemName?: string | undefined;
}) {
  const [action, setAction] = React.useState<PermissionRequestDecisionAction | null>(null);
  const [reason, setReason] = React.useState('');
  const [policyCitation, setPolicyCitation] = React.useState('');
  const [peerReviewerAbsence, setPeerReviewerAbsence] = React.useState('');
  const [expirationMode, setExpirationMode] = React.useState<ApprovalExpirationMode>('keep');
  const [expirationValidationAttempted, setExpirationValidationAttempted] = React.useState(false);
  const [expirationFieldTouched, setExpirationFieldTouched] = React.useState(false);
  const [expirationDraftValid, setExpirationDraftValid] = React.useState(true);
  const [expirationDate, setExpirationDate] = React.useState(
    request.requested_expiration?.slice(0, 10) ?? '',
  );
  const { key: idempotencyKey, markConsumed } = useIdempotencyKey();
  const mutation = useDecidePermissionRequest();
  const me = useMe();
  const workspaceSettings = useWorkspaceSettings();
  const minExpirationDate = localDateInputValue(new Date());
  const selectedAction = ACTIONS.find((candidate) => candidate.value === action) ?? null;
  const needsReason =
    (selectedAction?.needsReason ?? false) ||
    (action === 'approve' &&
      isCapability(request.requested_capability) &&
      isSensitiveCapability(request.requested_capability));
  const decidable = request.status === 'pending' || request.status === 'needs_more_info';
  const isSelfApproval = request.requester_actor_id === me.data?.actor.id;
  const selfApprovalBlockedByPolicy =
    isSelfApproval && workspaceSettings.data?.permission_self_approval === 'forbidden';
  const showSelfApprovalCapture = isSelfApproval && action === 'approve';
  const selfApprovalReady =
    !showSelfApprovalCapture ||
    (policyCitation.trim().length >= 8 && peerReviewerAbsence.trim().length >= 8);
  const selfApprovalForbidden = showSelfApprovalCapture && selfApprovalBlockedByPolicy;
  const approvalExpirationChanged =
    action === 'approve' &&
    (expirationMode === 'clear'
      ? request.requested_expiration !== null
      : expirationMode === 'change' &&
        `${expirationDate}T23:59:59.000Z` !== request.requested_expiration);
  const expirationNeedsValidation =
    action === 'approve' &&
    expirationMode === 'change' &&
    (!expirationDraftValid || !isFutureApprovalExpiration(expirationDate));
  const expirationDateError =
    expirationNeedsValidation &&
    !isFutureApprovalExpiration(expirationDate) &&
    (expirationValidationAttempted || expirationFieldTouched)
      ? APPROVAL_EXPIRATION_ERROR
      : action === 'approve' &&
          expirationMode === 'change' &&
          expirationDraftValid &&
          hasExpirationFieldError(mutation.error)
        ? APPROVAL_EXPIRATION_ERROR
        : null;
  const submitDisabled =
    !decidable || action === null || !selfApprovalReady || selfApprovalForbidden;

  React.useEffect(() => {
    setAction(null);
    setReason('');
    setPolicyCitation('');
    setPeerReviewerAbsence('');
    setExpirationMode('keep');
    setExpirationValidationAttempted(false);
    setExpirationFieldTouched(false);
    setExpirationDraftValid(true);
    setExpirationDate(request.requested_expiration?.slice(0, 10) ?? '');
  }, [request.requested_expiration]);

  function submit() {
    if (action === null || submitDisabled || (needsReason && !reason.trim())) return;
    if (
      action === 'approve' &&
      expirationMode === 'change' &&
      (!expirationDraftValid || !isFutureApprovalExpiration(expirationDate))
    ) {
      setExpirationValidationAttempted(true);
      return;
    }
    mutation.mutate(
      {
        id: request.id,
        action,
        reason: reason.trim(),
        idempotencyKey,
        ...(approvalExpirationChanged
          ? {
              expiration: expirationMode === 'clear' ? null : `${expirationDate}T23:59:59.000Z`,
            }
          : {}),
        ...(showSelfApprovalCapture
          ? {
              selfApproval: {
                policy_citation: policyCitation.trim(),
                peer_reviewer_absence: peerReviewerAbsence.trim(),
              },
            }
          : {}),
      },
      { onSuccess: () => markConsumed() },
    );
  }

  if (!decidable) return null;

  return (
    <section
      className="flex flex-col gap-3 border-t border-border-subtle pt-5"
      data-testid="permission-decision-section"
    >
      <PanelSectionTitle>결정</PanelSectionTitle>
      <div className="flex flex-wrap gap-2" role="group" aria-label="결정 선택">
        {ACTIONS.map((candidate) => (
          <Button
            key={candidate.value}
            type="button"
            size="sm"
            variant={action === candidate.value ? 'secondary' : 'ghost'}
            aria-pressed={action === candidate.value}
            disabled={
              candidate.value === 'approve' &&
              isSelfApproval &&
              workspaceSettings.data?.permission_self_approval === 'forbidden'
            }
            onClick={() => {
              setAction(candidate.value);
              setExpirationValidationAttempted(false);
              mutation.reset();
            }}
          >
            {candidate.label}
          </Button>
        ))}
      </div>
      {selfApprovalBlockedByPolicy ? (
        <p className="text-xs text-accent-danger">
          Workspace policy에서 self-approval을 금지합니다. 다른 Admin이 이 요청을 승인해야 합니다.
        </p>
      ) : null}
      <label
        className="flex flex-col gap-2 text-sm text-text-secondary"
        htmlFor="permission-decision-reason"
      >
        사유{needsReason ? ' · 필수' : ' · 선택'}
        <Textarea
          id="permission-decision-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="검토 사유 또는 요청할 정보를 입력하세요."
        />
      </label>
      {action === 'approve' ? (
        <fieldset className="flex flex-col gap-2" data-testid="permission-approval-expiration">
          {/* FR-PERM-002 adds expiration decisions beyond the prototype's static decision actions. */}
          <legend className="text-sm font-medium text-text-secondary">승인 만료일</legend>
          <RadioGroup
            aria-label="승인 만료일"
            value={expirationMode}
            onValueChange={(value) => {
              setExpirationMode(value as ApprovalExpirationMode);
              setExpirationValidationAttempted(false);
              setExpirationFieldTouched(false);
              mutation.reset();
            }}
            className="gap-2"
          >
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <RadioGroupItem id="permission-approval-expiration-keep" value="keep" />
              <label htmlFor="permission-approval-expiration-keep" className="cursor-pointer">
                요청 만료일 유지 ·{' '}
                {request.requested_expiration
                  ? formatDateOnly(request.requested_expiration.slice(0, 10))
                  : '만료 없음'}
              </label>
            </div>
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <RadioGroupItem id="permission-approval-expiration-change" value="change" />
              <label htmlFor="permission-approval-expiration-change" className="cursor-pointer">
                만료일 변경
              </label>
            </div>
            <label
              className="flex flex-col gap-2 pl-6 text-sm text-text-secondary"
              htmlFor="permission-approval-expiration-date"
            >
              새 만료일
              <DatePicker
                id="permission-approval-expiration-date"
                min={minExpirationDate}
                aria-label="새 만료일"
                value={expirationDate}
                showValidation={expirationValidationAttempted || expirationFieldTouched}
                onBlur={() => setExpirationFieldTouched(true)}
                onValidityChange={setExpirationDraftValid}
                onChange={(value) => {
                  setExpirationDate(value ?? '');
                  setExpirationValidationAttempted(false);
                  mutation.reset();
                }}
                disabled={expirationMode !== 'change'}
                aria-invalid={expirationDateError !== null}
                {...(expirationDateError
                  ? { 'aria-describedby': 'permission-approval-expiration-error' }
                  : {})}
              />
            </label>
            {expirationDateError ? (
              <p
                id="permission-approval-expiration-error"
                role="alert"
                className="pl-6 text-xs text-accent-danger"
              >
                {expirationDateError}
              </p>
            ) : null}
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <RadioGroupItem id="permission-approval-expiration-clear" value="clear" />
              <label htmlFor="permission-approval-expiration-clear" className="cursor-pointer">
                만료 없음
              </label>
            </div>
          </RadioGroup>
        </fieldset>
      ) : null}
      {showSelfApprovalCapture ? (
        <section
          className="flex flex-col gap-3 rounded-md border border-border-selected bg-surface-field p-3"
          data-testid="self-approval-audit-capture"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-primary">
              직접 승인 감사 기록
            </span>
            <OutlineBadge>민감</OutlineBadge>
          </div>
          <p className="text-xs leading-5 text-text-secondary">
            이 결정은 본인이 작성한 요청을 본인이 승인하는 self-approval 입니다. 감사 로그에
            SELF_APPROVAL 라벨이 부여되고 다음 두 항목이 함께 캡처됩니다.
          </p>
          <label
            className="flex flex-col gap-2 text-sm text-text-secondary"
            htmlFor="self-approval-policy-citation"
          >
            Policy citation <span className="text-accent-danger">· 필수 (≥ 8자)</span>
            <Input
              id="self-approval-policy-citation"
              value={policyCitation}
              onChange={(event) => setPolicyCitation(event.target.value)}
              placeholder="예: task.self_approve_request scoped capability — workspace policy §4.3"
            />
          </label>
          <label
            className="flex flex-col gap-2 text-sm text-text-secondary"
            htmlFor="self-approval-peer-reviewer-absence"
          >
            Peer reviewer 부재 사유 <span className="text-accent-danger">· 필수 (≥ 8자)</span>
            <Textarea
              id="self-approval-peer-reviewer-absence"
              value={peerReviewerAbsence}
              onChange={(event) => setPeerReviewerAbsence(event.target.value)}
              placeholder="예: powerbi scope 의 다른 reviewer 모두 PTO. 정시 release 마감 때문에 대기 불가."
              rows={2}
            />
          </label>
          <div className="flex flex-col gap-1 rounded bg-surface-detail p-3 text-xs text-text-secondary">
            <span className="uppercase tracking-wide text-text-muted">감사 envelope 미리보기</span>
            <span>label: SELF_APPROVAL</span>
            <span>
              actor: {me.data?.actor.id ?? '—'} · subject: {request.requester_actor_id}
            </span>
            <span>capability: {request.requested_capability}</span>
            <span>
              scope:{' '}
              {request.requested_managed_system_id
                ? (managedSystemName ?? 'Managed System')
                : '워크스페이스 전체'}
            </span>
            {request.requested_managed_system_id && !managedSystemName && (
              <span className="font-mono text-text-muted">
                {shortId(request.requested_managed_system_id)}
              </span>
            )}
            <span>policy_citation: {policyCitation || '— (필수)'}</span>
            <span>
              no_peer_reviewer:{' '}
              {peerReviewerAbsence
                ? `\"${peerReviewerAbsence.slice(0, 56)}${peerReviewerAbsence.length > 56 ? '…' : ''}\"`
                : '— (필수)'}
            </span>
          </div>
          {selfApprovalForbidden ? (
            <p className="text-xs text-accent-danger">
              Workspace policy에서 self-approval을 금지합니다. 다른 Admin이 이 요청을 승인해야
              합니다.
            </p>
          ) : null}
          <p className="text-xs text-text-muted">
            이 envelope 는 Workspace Admin Audit · Compliance Export 에 모두 노출됩니다. 정책 근거가
            모호하면 self-approval 대신 Need more info 로 변경하세요.
          </p>
        </section>
      ) : null}
      <Button
        type="button"
        onClick={submit}
        loading={mutation.isPending}
        disabled={submitDisabled}
        data-testid="permission-decision-submit"
      >
        {showSelfApprovalCapture
          ? 'Self-approve 확정 · 감사 캡처'
          : selectedAction
            ? `${selectedAction.label} 처리`
            : '결정을 선택하세요'}
      </Button>
      <p className="text-xs text-text-muted">
        승인은 차단된 액션을 자동으로 실행하지 않습니다. 요청자는 다시 동일 액션을 명시적으로
        실행해야 합니다.
      </p>
    </section>
  );
}
