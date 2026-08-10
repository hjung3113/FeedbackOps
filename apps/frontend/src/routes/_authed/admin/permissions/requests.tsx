import {
  Button,
  FieldRow,
  Input,
  ListShell,
  ObjectRow,
  OutlineBadge,
  PanelSectionTitle,
  Textarea,
} from "@fops/ui";
import { isCapability, isSensitiveCapability } from "@fops/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";

import { PermissionGate } from "../../../../features/admin/permissions/permission-gate.js";
import { useWorkspaceActors } from "../../../../features/admin/permissions/permission-state-view.js";
import {
  permissionRequestsReviewKey,
  useDecidePermissionRequest,
} from "../../../../features/admin/permissions/useDecidePermissionRequest.js";
import { useWorkspaceSettings } from "../../../../features/admin/settings/use-workspace-settings.js";
import { useMe } from "../../../../lib/auth/useMe.js";
import {
  fetchPermissionRequestsAll,
  type AdminPermissionRequestRow,
  type PermissionRequestDecisionAction,
  useIdempotencyKey,
} from "../../../../lib/api";

export const Route = createFileRoute("/_authed/admin/permissions/requests")({
  component: PermissionRequestsConsolePage,
});

type ReviewTab = AdminPermissionRequestRow["status"] | "all";

const TABS: Array<{ value: ReviewTab; label: string }> = [
  { value: "pending", label: "대기 중" },
  { value: "needs_more_info", label: "추가 정보 필요" },
  { value: "approved", label: "승인됨" },
  { value: "rejected", label: "거절됨" },
  { value: "all", label: "전체" },
];

const STATUS_LABEL: Record<AdminPermissionRequestRow["status"], string> = {
  pending: "대기 중",
  needs_more_info: "추가 정보 필요",
  approved: "승인됨",
  rejected: "거절됨",
};

const ACTIONS: Array<{
  value: PermissionRequestDecisionAction;
  label: string;
  needsReason: boolean;
}> = [
  { value: "approve", label: "승인", needsReason: false },
  { value: "need-more-info", label: "추가 정보 요청", needsReason: true },
  { value: "reject", label: "거절", needsReason: true },
  { value: "deny", label: "명시적 거부", needsReason: true },
];

export function PermissionRequestsConsolePage() {
  return (
    <PermissionGate capability="workspace.admin">
      <PermissionRequestsConsole />
    </PermissionGate>
  );
}

function PermissionRequestsConsole() {
  const query = useQuery({
    queryKey: permissionRequestsReviewKey,
    queryFn: ({ signal }) =>
      fetchPermissionRequestsAll({ status: "all", signal }),
    retry: false,
  });
  const actors = useWorkspaceActors();
  const actorNames = Object.fromEntries(
    (actors.data ?? []).map((actor) => [actor.id, actor.display_name]),
  );
  const [activeTab, setActiveTab] = React.useState<ReviewTab>("pending");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const previousActiveTab = React.useRef<ReviewTab | null>(null);
  const hasAppliedInitialSelection = React.useRef(false);
  const allRequests = query.data?.requests ?? [];
  const visibleRequests =
    activeTab === "all"
      ? allRequests
      : allRequests.filter((request) => request.status === activeTab);
  const selected =
    visibleRequests.find((request) => request.id === selectedId) ?? null;

  React.useEffect(() => {
    const tabChanged = previousActiveTab.current !== activeTab;
    previousActiveTab.current = activeTab;

    if (tabChanged) {
      const selectionIsVisible =
        selectedId !== null &&
        visibleRequests.some((request) => request.id === selectedId);
      if (!selectionIsVisible) {
        setSelectedId(visibleRequests[0]?.id ?? null);
      }
      return;
    }

    if (
      selectedId !== null &&
      !visibleRequests.some((request) => request.id === selectedId)
    ) {
      setSelectedId(null);
      return;
    }

    if (!hasAppliedInitialSelection.current && visibleRequests[0]) {
      hasAppliedInitialSelection.current = true;
      if (selectedId === null) setSelectedId(visibleRequests[0].id);
      return;
    }
  }, [activeTab, selectedId, visibleRequests]);

  return (
    <ListShell
      toolbar={{
        title: "권한 요청 검토",
        subtitle: "워크스페이스 권한 요청을 검토하고 결정합니다.",
      }}
      tabs={
        <div
          className="flex items-center gap-1"
          role="tablist"
          aria-label="권한 요청 상태"
        >
          {TABS.map((tab) => {
            const count =
              tab.value === "all"
                ? allRequests.length
                : allRequests.filter((request) => request.status === tab.value)
                    .length;
            return (
              <Button
                key={tab.value}
                type="button"
                variant={activeTab === tab.value ? "secondary" : "ghost"}
                size="sm"
                role="tab"
                aria-selected={activeTab === tab.value}
                onClick={() => setActiveTab(tab.value)}
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
          aria-label={`${TABS.find((tab) => tab.value === activeTab)?.label} 요청`}
          data-testid="permission-requests-list"
        >
          {query.isPending ? (
            <p className="p-6 text-sm text-text-muted">
              권한 요청을 불러오는 중입니다.
            </p>
          ) : null}
          {query.isError ? (
            <p className="p-6 text-sm text-accent-danger">
              권한 요청을 불러오지 못했습니다.
            </p>
          ) : null}
          {!query.isPending &&
          !query.isError &&
          visibleRequests.length === 0 ? (
            <p className="p-6 text-sm text-text-muted">
              표시할 권한 요청이 없습니다.
            </p>
          ) : null}
          {visibleRequests.map((request) => (
            <PermissionRequestRow
              key={request.id}
              request={request}
              actorName={actorNames[request.requester_actor_id]}
              selected={selectedId === request.id}
              onSelect={() => setSelectedId(request.id)}
            />
          ))}
        </section>
      }
      detailPanel={
        selected ? (
          <PermissionRequestDetail
            request={selected}
            actorName={actorNames[selected.requester_actor_id]}
            onClose={() => setSelectedId(null)}
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
      badges={<OutlineBadge>{STATUS_LABEL[request.status]}</OutlineBadge>}
      meta={
        <>
          <span>
            {request.requested_managed_system_id ?? "워크스페이스 전체"}
          </span>
          <span>·</span>
          <span>{formatDate(request.created_at)}</span>
        </>
      }
      trailing={
        <span className="text-right text-xs text-text-muted">
          <span className="block text-text-primary">{actorName ?? "Unknown requester"}</span>
          <span className="font-mono">{request.requester_actor_id.slice(0, 8)}</span>
        </span>
      }
    />
  );
}

function PermissionRequestDetail({
  request,
  actorName,
  onClose,
}: {
  request: AdminPermissionRequestRow;
  actorName?: string | undefined;
  onClose: () => void;
}) {
  const [action, setAction] =
    React.useState<PermissionRequestDecisionAction>("approve");
  const [reason, setReason] = React.useState("");
  const [policyCitation, setPolicyCitation] = React.useState("");
  const [peerReviewerAbsence, setPeerReviewerAbsence] = React.useState("");
  const { key: idempotencyKey, markConsumed } = useIdempotencyKey();
  const mutation = useDecidePermissionRequest();
  const me = useMe();
  const workspaceSettings = useWorkspaceSettings();
  const selectedAction =
    ACTIONS.find((candidate) => candidate.value === action) ?? ACTIONS[0]!;
  const needsReason =
    selectedAction.needsReason ||
    (action === "approve" &&
      isCapability(request.requested_capability) &&
      isSensitiveCapability(request.requested_capability));
  const decidable =
    request.status === "pending" || request.status === "needs_more_info";
  const isSelfApproval = request.requester_actor_id === me.data?.actor.id;
  const showSelfApprovalCapture = isSelfApproval && action === "approve";
  const selfApprovalReady =
    !showSelfApprovalCapture ||
    (policyCitation.trim().length >= 8 && peerReviewerAbsence.trim().length >= 8);
  const selfApprovalForbidden =
    showSelfApprovalCapture &&
    workspaceSettings.data?.permission_self_approval === "forbidden";
  const submitDisabled =
    !decidable ||
    !selfApprovalReady ||
    selfApprovalForbidden;

  React.useEffect(() => {
    setAction("approve");
    setReason("");
    setPolicyCitation("");
    setPeerReviewerAbsence("");
  }, [request.id]);

  function submit() {
    if (submitDisabled || (needsReason && !reason.trim())) return;
    mutation.mutate(
      {
        id: request.id,
        action,
        reason: reason.trim(),
        idempotencyKey,
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
        <OutlineBadge>{STATUS_LABEL[request.status]}</OutlineBadge>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          aria-label="패널 닫기"
        >
          닫기
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            <PanelSectionTitle>요청 정보</PanelSectionTitle>
            <FieldRow label="요청자" className="px-0">
              <span className="flex flex-col gap-0.5">
                <span>{actorName ?? "Unknown requester"}</span>
                <span className="font-mono text-xs text-text-muted">
                  {request.requester_actor_id}
                </span>
              </span>
            </FieldRow>
            <FieldRow label="요청 권한" className="px-0">
              <span>{request.requested_capability}</span>
            </FieldRow>
            <FieldRow label="범위" className="px-0">
              <span>
                {request.requested_managed_system_id ?? "워크스페이스 전체"}
              </span>
            </FieldRow>
            <FieldRow label="상태" className="px-0">
              <OutlineBadge>{STATUS_LABEL[request.status]}</OutlineBadge>
            </FieldRow>
            <FieldRow label="요청 일시" className="px-0">
              <span>{formatDate(request.created_at)}</span>
            </FieldRow>
          </section>
          <section className="flex flex-col gap-2">
            <PanelSectionTitle>요청 사유</PanelSectionTitle>
            <p className="whitespace-pre-wrap text-sm text-text-primary">
              {request.reason}
            </p>
          </section>
          {decidable ? (
            <section
              className="flex flex-col gap-3 border-t border-border-subtle pt-5"
              data-testid="permission-decision-section"
            >
              <PanelSectionTitle>결정</PanelSectionTitle>
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="결정 선택"
              >
                {ACTIONS.map((candidate) => (
                  <Button
                    key={candidate.value}
                    type="button"
                    size="sm"
                    variant={action === candidate.value ? "secondary" : "ghost"}
                    aria-pressed={action === candidate.value}
                    disabled={
                      candidate.value === "approve" &&
                      isSelfApproval &&
                      workspaceSettings.data?.permission_self_approval === "forbidden"
                    }
                    onClick={() => setAction(candidate.value)}
                  >
                    {candidate.label}
                  </Button>
                ))}
              </div>
              <label
                className="flex flex-col gap-2 text-sm text-text-secondary"
                htmlFor="permission-decision-reason"
              >
                사유{needsReason ? " · 필수" : " · 선택"}
                <Textarea
                  id="permission-decision-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="검토 사유 또는 요청할 정보를 입력하세요."
                />
              </label>
              {showSelfApprovalCapture ? (
                <section
                  className="flex flex-col gap-3 rounded-md border border-border-selected bg-surface-field p-3"
                  data-testid="self-approval-audit-capture"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-text-primary">
                      Self-approval audit capture
                    </span>
                    <OutlineBadge>SENSITIVE</OutlineBadge>
                  </div>
                  <p className="text-xs leading-5 text-text-secondary">
                    이 결정은 본인이 작성한 요청을 본인이 승인하는 self-approval 입니다. 감사 로그에 SELF_APPROVAL 라벨이 부여되고 다음 두 항목이 함께 캡처됩니다.
                  </p>
                  <label className="flex flex-col gap-2 text-sm text-text-secondary" htmlFor="self-approval-policy-citation">
                    Policy citation <span className="text-accent-danger">· 필수 (≥ 8자)</span>
                    <Input
                      id="self-approval-policy-citation"
                      value={policyCitation}
                      onChange={(event) => setPolicyCitation(event.target.value)}
                      placeholder="예: task.self_approve_request scoped capability — workspace policy §4.3"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm text-text-secondary" htmlFor="self-approval-peer-reviewer-absence">
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
                      actor: {me.data?.actor.id ?? "—"} · subject: {request.requester_actor_id}
                    </span>
                    <span>capability: {request.requested_capability}</span>
                    <span>
                      scope: {request.requested_managed_system_id ?? "워크스페이스 전체"}
                    </span>
                    <span>policy_citation: {policyCitation || "— (필수)"}</span>
                    <span>
                      no_peer_reviewer: {peerReviewerAbsence ? `\"${peerReviewerAbsence.slice(0, 56)}${peerReviewerAbsence.length > 56 ? "…" : ""}\"` : "— (필수)"}
                    </span>
                  </div>
                  {selfApprovalForbidden ? (
                    <p className="text-xs text-accent-danger">
                      Workspace policy에서 self-approval을 금지합니다. 다른 Admin이 이 요청을 승인해야 합니다.
                    </p>
                  ) : null}
                  <p className="text-xs text-text-muted">
                    이 envelope 는 Workspace Admin Audit · Compliance Export 에 모두 노출됩니다. 정책 근거가 모호하면 self-approval 대신 Need more info 로 변경하세요.
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
                {showSelfApprovalCapture ? "Self-approve 확정 · 감사 캡처" : `${selectedAction.label} 처리`}
              </Button>
              <p className="text-xs text-text-muted">
                승인은 차단된 액션을 자동으로 실행하지 않습니다. 요청자는 다시 동일 액션을 명시적으로 실행해야 합니다.
              </p>
            </section>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
