import {
  Button,
  DetailPanelHeader,
  FieldRow,
  ListShell,
  ObjectRow,
  OutlineBadge,
  PanelSectionTitle,
  Textarea,
} from "@fops/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";

import { PermissionGate } from "../../../../features/admin/permissions/permission-gate.js";
import {
  permissionRequestsReviewKey,
  useDecidePermissionRequest,
} from "../../../../features/admin/permissions/useDecidePermissionRequest.js";
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
  { value: "need-more-info", label: "추가 정보 요청", needsReason: false },
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
  const [activeTab, setActiveTab] = React.useState<ReviewTab>("pending");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const allRequests = query.data?.requests ?? [];
  const visibleRequests =
    activeTab === "all"
      ? allRequests
      : allRequests.filter((request) => request.status === activeTab);
  const selected =
    visibleRequests.find((request) => request.id === selectedId) ?? null;

  React.useEffect(() => {
    if (selectedId === null && visibleRequests[0])
      setSelectedId(visibleRequests[0].id);
  }, [selectedId, visibleRequests]);

  React.useEffect(() => {
    if (
      selectedId !== null &&
      !visibleRequests.some((request) => request.id === selectedId)
    ) {
      setSelectedId(null);
    }
  }, [selectedId, visibleRequests]);

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
            onClose={() => setSelectedId(null)}
          />
        ) : undefined
      }
    />
  );
}

function PermissionRequestRow({
  request,
  selected,
  onSelect,
}: {
  request: AdminPermissionRequestRow;
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
        <span className="font-mono text-xs text-text-muted">
          {request.requester_actor_id.slice(0, 8)}
        </span>
      }
    />
  );
}

function PermissionRequestDetail({
  request,
  onClose,
}: {
  request: AdminPermissionRequestRow;
  onClose: () => void;
}) {
  const [action, setAction] =
    React.useState<PermissionRequestDecisionAction>("approve");
  const [reason, setReason] = React.useState("");
  const { key: idempotencyKey, markConsumed } = useIdempotencyKey();
  const mutation = useDecidePermissionRequest();
  const selectedAction =
    ACTIONS.find((candidate) => candidate.value === action) ?? ACTIONS[0]!;
  const decidable =
    request.status === "pending" || request.status === "needs_more_info";

  React.useEffect(() => {
    setAction("approve");
    setReason("");
  }, [request.id]);

  function submit() {
    if (selectedAction.needsReason && !reason.trim()) return;
    mutation.mutate(
      { id: request.id, action, reason: reason.trim(), idempotencyKey },
      { onSuccess: () => markConsumed() },
    );
  }

  return (
    <aside
      className="flex h-full min-h-0 flex-col bg-surface-detail"
      data-testid="permission-request-detail-panel"
    >
      <DetailPanelHeader
        kind="task"
        id={request.id.slice(0, 8)}
        onClose={onClose}
        extras={<OutlineBadge>{STATUS_LABEL[request.status]}</OutlineBadge>}
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            <PanelSectionTitle>요청 정보</PanelSectionTitle>
            <FieldRow label="요청자" className="px-0">
              <span className="font-mono text-xs">
                {request.requester_actor_id}
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
                사유{selectedAction.needsReason ? " · 필수" : " · 선택"}
                <Textarea
                  id="permission-decision-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="검토 사유 또는 요청할 정보를 입력하세요."
                />
              </label>
              <p className="text-xs text-text-muted">
                승인은 차단된 액션을 자동으로 실행하지 않습니다.
              </p>
              <Button
                type="button"
                onClick={submit}
                loading={mutation.isPending}
                data-testid="permission-decision-submit"
              >
                {selectedAction.label} 처리
              </Button>
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
