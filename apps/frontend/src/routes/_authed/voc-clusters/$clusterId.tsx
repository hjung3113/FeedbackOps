// /voc-clusters/:clusterId — VOC Cluster detail page.
// Shows cluster metadata, member VOC list, and action CTAs
// (Add VOC, Remove VOC, Confirm cluster, Create Finding).
// Admin/Developer CTAs are gated via role_level check (backend is authoritative).

import {
  type CreateFindingRequest,
  type FindingSeverity,
  type LinkedFindingDto,
  type VocClusterMemberDto,
  createFindingRequestSchema,
} from "@fops/shared";
import {
  Button,
  DetailPanelSectionNav,
  DetailPanelHeader,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FieldLabel,
  FieldRow,
  Input,
  Label,
  ListShell,
  ObjectRow,
  ManagedSystemPill,
  OutlineBadge,
  PanelSectionTitle,
  type ReporterStatusBadge,
  SeverityBadge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
} from "@fops/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { RequestTaskModal } from "@/features/tasks/components/RequestTaskModal";
import { useAddClusterMember } from "@/features/voc-cluster/hooks/useAddClusterMember";
import { useCandidatePeers } from "@/features/voc-cluster/hooks/useCandidatePeers";
import { useConfirmCluster } from "@/features/voc-cluster/hooks/useConfirmCluster";
import { useCreateFindingFromCluster } from "@/features/voc-cluster/hooks/useCreateFindingFromCluster";
import { useLinkExistingFindingToVocCluster } from "@/features/voc-cluster/hooks/useLinkExistingFindingToVocCluster";
import { useRemoveClusterMember } from "@/features/voc-cluster/hooks/useRemoveClusterMember";
import { useRequestTaskFromCluster } from "@/features/voc-cluster/hooks/useRequestTaskFromCluster";
import { useVocClusterDetail } from "@/features/voc-cluster/hooks/useVocClusterDetail";
import { useVocClusterList } from "@/features/voc-cluster/hooks/useVocClusterList";
import { useManagedSystem } from "@/features/voc/hooks/useManagedSystem";
import { useFindingsList } from "@/features/integration/hooks/useFindingsList";
import { EntityRelationRow } from "@/features/integration/components/EntityRelationRow";
import { type ApiError, errorMapper, useIdempotencyKey } from "@/lib/api";
import { useMe } from "@/lib/auth/useMe";

export const Route = createFileRoute("/_authed/voc-clusters/$clusterId")({
  component: VocClusterDetailPage,
});

// ── Severity options (mirrors CreateFindingModal) ─────────────────────────────

const SEVERITY_OPTIONS: { value: FindingSeverity; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

// ── Status badge ──────────────────────────────────────────────────────────────

function DetailStatusBadge({ status }: { status: string }): React.ReactElement {
  const label = status === "confirmed" ? "확정" : "초안";
  return (
    <OutlineBadge data-testid="cluster-detail-status-badge">
      {label}
    </OutlineBadge>
  );
}

// ── Section divider ───────────────────────────────────────────────────────────

function SectionDivider(): React.ReactElement {
  return <hr className="border-border-subtle" />;
}

type VocClusterMemberPresentation = VocClusterMemberDto & {
  display_id?: string | null;
  title?: string | null;
};

type VocClusterDetailPresentation = {
  display_id?: string | null;
  members?: VocClusterMemberPresentation[];
  linked_findings?: LinkedFindingDto[];
};

type VocClusterListPresentation = {
  id: string;
  display_id: string;
  title: string;
  status: string;
  created_at: string;
  member_count: number;
  members?: { voc_id: string }[] | undefined;
  linked_findings?: LinkedFindingDto[] | undefined;
};

function shortId(id: string): string {
  return `${id.slice(0, 8)}...`;
}

function dot() {
  return (
    <span
      className="h-1 w-1 rounded-full bg-text-muted/60"
      aria-hidden="true"
    />
  );
}

function formatDate(raw: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
  }).format(new Date(raw));
}

function ListStatusBadge({ status }: { status: string }): React.ReactElement {
  const label = status === "confirmed" ? "확정" : "초안";
  return (
    <OutlineBadge data-testid={`cluster-status-badge-${status}`}>
      {label}
    </OutlineBadge>
  );
}

function clusterDisplayId(data: {
  id: string;
  display_id?: string | null;
}): string {
  return data.display_id?.trim() ? data.display_id : shortId(data.id);
}

function memberDisplay(member: VocClusterMemberPresentation): {
  primary: string;
  secondary: string | null;
} {
  if (member.title?.trim()) {
    return {
      primary: member.title,
      secondary: member.display_id?.trim()
        ? member.display_id
        : shortId(member.voc_id),
    };
  }
  if (member.display_id?.trim()) {
    return { primary: member.display_id, secondary: shortId(member.voc_id) };
  }
  return { primary: "VOC", secondary: shortId(member.voc_id) };
}

// ── ListShell route hosts ────────────────────────────────────────────────────

export function VocClusterDetailPage(): React.ReactElement {
  const { clusterId } = Route.useParams();
  const navigate = useNavigate();

  return (
    <VocClusterListShell
      selectedId={clusterId}
      onSelect={(id) =>
        void navigate({
          to: "/voc-clusters/$clusterId",
          params: { clusterId: id },
        })
      }
      onCloseDetail={() => void navigate({ to: "/voc-clusters" })}
    />
  );
}

export function VocClusterListShell({
  selectedId,
  onSelect,
  toolbarActions,
  onCloseDetail,
  defaultToFirst = false,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  toolbarActions?: React.ReactNode;
  onCloseDetail: () => void;
  defaultToFirst?: boolean;
}): React.ReactElement {
  const listQuery = useVocClusterList();
  const clusters = listQuery.data?.items ?? [];
  const [activeTab, setActiveTab] = useState<
    "all" | "confirmed" | "no-finding"
  >("all");
  const visibleClusters = clusters.filter((cluster) => {
    if (activeTab === "confirmed") return cluster.status === "confirmed";
    if (activeTab === "no-finding")
      return (cluster.linked_findings ?? []).length === 0;
    return true;
  });

  React.useEffect(() => {
    if (defaultToFirst && selectedId === null && visibleClusters[0])
      onSelect(visibleClusters[0].id);
  }, [defaultToFirst, onSelect, selectedId, visibleClusters]);

  React.useEffect(() => {
    if (
      listQuery.isSuccess &&
      selectedId !== null &&
      !visibleClusters.some((cluster) => cluster.id === selectedId)
    ) {
      onCloseDetail();
    }
  }, [listQuery.isSuccess, onCloseDetail, selectedId, visibleClusters]);

  return (
    <ListShell
      toolbar={{
        title: "VOC 클러스터",
        subtitle: "VOC를 유사 주제로 묶어 Finding으로 승격합니다.",
        actions: toolbarActions,
      }}
      list={
        <ClusterListBody
          clusters={visibleClusters}
          allClusters={clusters}
          isPending={listQuery.isPending}
          isError={listQuery.isError}
          selectedId={selectedId}
          onSelect={onSelect}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      }
      detailPanel={
        selectedId !== null &&
        visibleClusters.some((cluster) => cluster.id === selectedId) ? (
          <VocClusterDetailPanel
            clusterId={selectedId}
            onClose={onCloseDetail}
          />
        ) : undefined
      }
    />
  );
}

function ClusterListBody({
  clusters,
  allClusters,
  isPending,
  isError,
  selectedId,
  onSelect,
  activeTab,
  onTabChange,
}: {
  clusters: VocClusterListPresentation[];
  allClusters: VocClusterListPresentation[];
  isPending: boolean;
  isError: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  activeTab: "all" | "confirmed" | "no-finding";
  onTabChange: (tab: "all" | "confirmed" | "no-finding") => void;
}): React.ReactElement {
  const tabs = [
    { key: "all" as const, label: "전체", count: allClusters.length },
    {
      key: "confirmed" as const,
      label: "확정",
      count: allClusters.filter((cluster) => cluster.status === "confirmed")
        .length,
    },
    {
      key: "no-finding" as const,
      label: "Finding 없음",
      count: allClusters.filter(
        (cluster) => (cluster.linked_findings ?? []).length === 0,
      ).length,
    },
  ];

  return (
    <section className="flex min-h-full flex-col">
      <div
        className="flex h-toolbar items-center justify-between gap-3 border-b border-border-subtle bg-surface-canvas px-4"
        data-toolbar-height="50"
      >
        <div
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap"
          role="tablist"
          aria-label="클러스터 필터"
        >
          {tabs.map((tab) => (
            <Button
              key={tab.key}
              type="button"
              variant={activeTab === tab.key ? "secondary" : "ghost"}
              size="sm"
              role="tab"
              id={`cluster-tab-${tab.key}`}
              aria-controls="cluster-list-panel"
              aria-selected={activeTab === tab.key}
              onClick={() => onTabChange(tab.key)}
              data-testid={`cluster-tab-${tab.key}`}
            >
              {tab.label} {tab.count}
            </Button>
          ))}
        </div>
        <span className="shrink-0 text-xs text-text-muted">
          {clusters.length}개
        </span>
      </div>

      <div
        id="cluster-list-panel"
        role="tabpanel"
        aria-labelledby={`cluster-tab-${activeTab}`}
      >
        {isPending ? (
          <div className="space-y-2 p-4" data-testid="cluster-list-skeleton">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : isError ? (
          <p
            className="p-4 text-sm text-accent-danger"
            data-testid="cluster-list-error"
          >
            데이터를 불러오지 못했습니다.
          </p>
        ) : clusters.length === 0 ? (
          <div
            className="p-8 text-center text-sm text-text-muted"
            data-testid="cluster-empty-state"
          >
            생성된 클러스터가 없습니다.
          </div>
        ) : (
          <div data-testid="cluster-list">
            {clusters.map((cluster) => (
              <ClusterRow
                key={cluster.id}
                cluster={cluster}
                selected={selectedId === cluster.id}
                onClick={() => onSelect(cluster.id)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ClusterRow({
  cluster,
  selected,
  onClick,
}: {
  cluster: VocClusterListPresentation;
  selected: boolean;
  onClick: () => void;
}): React.ReactElement {
  const memberCount = cluster.member_count;

  return (
    <ObjectRow
      id={cluster.display_id}
      title={cluster.title}
      selected={selected}
      density="default"
      onClick={onClick}
      badges={<ListStatusBadge status={cluster.status} />}
      meta={
        <>
          <span>VOC {memberCount}개</span>
          {dot()}
          <span>{formatDate(cluster.created_at)}</span>
        </>
      }
    />
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function VocClusterDetailPanel({
  clusterId,
  onClose,
}: {
  clusterId: string;
  onClose?: () => void;
}): React.ReactElement {
  const { data, isLoading, isError, error } = useVocClusterDetail(clusterId);
  const presentation = data as
    | (typeof data & VocClusterDetailPresentation)
    | undefined;
  const managedSystem = useManagedSystem(data?.primary_managed_system_id);
  const { data: me } = useMe();
  const canMutate =
    me?.actor.role_level === "admin" || me?.actor.role_level === "developer";

  const [addVocOpen, setAddVocOpen] = useState(false);
  const [createFindingOpen, setCreateFindingOpen] = useState(false);
  const [linkFindingOpen, setLinkFindingOpen] = useState(false);
  const [requestTaskOpen, setRequestTaskOpen] = useState(false);
  const {
    key: requestTaskIdempotencyKey,
    markConsumed: markRequestTaskConsumed,
  } = useIdempotencyKey();

  const confirmMutation = useConfirmCluster();
  const removeMemberMutation = useRemoveClusterMember();
  const requestTaskMutation = useRequestTaskFromCluster({
    clusterId,
    idempotencyKey: requestTaskIdempotencyKey,
    onError: (err: ApiError) => toast.error(errorMapper(err.envelope).message),
  });
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div
        className="flex flex-col gap-4 p-6"
        aria-label="클러스터 상세 불러오는 중"
        data-testid="cluster-detail-skeleton"
      >
        <Skeleton className="h-7 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    const code = (error as { code?: string } | null)?.code;
    return (
      <div
        className="flex flex-col items-center justify-center py-16 px-6 text-center"
        data-testid="cluster-detail-error"
      >
        <p className="text-sm text-feedback-error">
          {code === "not_found.record"
            ? "클러스터를 찾을 수 없습니다."
            : "데이터를 불러오지 못했습니다."}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => void navigate({ to: "/voc-clusters" })}
        >
          목록으로
        </Button>
      </div>
    );
  }

  const members: VocClusterMemberPresentation[] = presentation?.members ?? [];
  const linkedFindings = presentation?.linked_findings ?? [];
  const sectionScrollRef = React.useRef<HTMLDivElement>(null);

  function handleConfirm() {
    confirmMutation.mutate(clusterId, {
      onSuccess: () => toast.success("클러스터가 확정되었습니다."),
      onError: (err: ApiError) =>
        toast.error(errorMapper(err.envelope).message),
    });
  }

  function handleRemoveMember(vocId: string) {
    removeMemberMutation.mutate(
      { clusterId, vocId },
      {
        onSuccess: () => toast.success("VOC가 클러스터에서 제거되었습니다."),
        onError: (err: ApiError) =>
          toast.error(errorMapper(err.envelope).message),
      },
    );
  }

  function closeRequestTaskModal(): void {
    requestTaskMutation.reset();
    setRequestTaskOpen(false);
  }

  return (
    <aside
      className="flex h-full min-h-0 flex-col bg-surface-detail"
      data-testid="cluster-detail-panel"
    >
      <DetailPanelHeader
        kind="cluster"
        id={clusterDisplayId(data)}
        onClose={onClose ?? (() => void navigate({ to: "/voc-clusters" }))}
      />
      <DetailPanelSectionNav
        scrollRef={sectionScrollRef}
        sections={[
          { id: "overview", label: "Overview" },
          { id: "why", label: "Why" },
          { id: "execution", label: "Execution" },
          { id: "members", label: "Members", count: data.member_count },
          { id: "properties", label: "Properties" },
        ]}
      />
      <div
        ref={sectionScrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-6 py-6"
      >
        <div className="flex flex-col gap-6">
          <section data-anchor="overview" className="flex flex-col gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <OutlineBadge>VOC Cluster</OutlineBadge>
                <DetailStatusBadge status={data.status} />
                {data.severity && <SeverityBadge severity={data.severity} />}
                {data.confidence && (
                  <OutlineBadge data-testid="cluster-detail-confidence-badge">
                    Confidence · {data.confidence}
                  </OutlineBadge>
                )}
              </div>
              <h1
                className="text-xl font-semibold text-text-primary"
                data-testid="cluster-detail-title"
              >
                {data.title}
              </h1>
            </div>
            {data.summary ? (
              <div className="flex flex-col gap-1">
                <PanelSectionTitle>요약</PanelSectionTitle>
                <p
                  className="text-sm text-text-primary whitespace-pre-wrap"
                  data-testid="cluster-detail-summary"
                >
                  {data.summary}
                </p>
              </div>
            ) : (
              <p
                className="text-sm text-text-muted"
                data-testid="cluster-detail-summary-empty"
              >
                요약이 없습니다.
              </p>
            )}
          </section>

          <SectionDivider />

          <section data-anchor="why" className="flex flex-col gap-1">
            <PanelSectionTitle>Why grouped</PanelSectionTitle>
            {data.rationale ? (
              <p
                className="rounded-md border border-border-subtle bg-surface-card p-3 text-sm text-text-primary whitespace-pre-wrap"
                data-testid="cluster-detail-rationale"
              >
                {data.rationale}
              </p>
            ) : (
              <p
                className="text-sm text-text-muted"
                data-testid="cluster-detail-rationale-empty"
              >
                그룹화 이유가 없습니다.
              </p>
            )}
          </section>

          <SectionDivider />

          <section className="flex flex-col gap-3" data-anchor="execution">
            <PanelSectionTitle>실행</PanelSectionTitle>
            {linkedFindings.length > 0 ? (
              <div
                className="flex flex-col gap-2"
                data-testid="cluster-linked-findings-list"
              >
                {linkedFindings.map((finding) => (
                  <div
                    key={finding.id}
                    className="flex flex-col gap-2 rounded-md border border-border-subtle bg-surface-card p-4"
                    data-testid={`cluster-linked-finding-${finding.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <OutlineBadge
                        data-testid={`finding-status-badge-${finding.status}`}
                      >
                        {finding.status}
                      </OutlineBadge>
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs text-text-muted">
                        {finding.display_id}
                      </span>
                      <p className="mt-1 text-sm font-medium text-text-primary">
                        {(
                          finding as LinkedFindingDto & {
                            title?: string | null;
                          }
                        ).title ?? finding.display_id}
                      </p>
                    </div>
                    <Link
                      to="/findings/$findingId"
                      params={{ findingId: finding.id }}
                      className="text-sm text-accent-primary underline underline-offset-2 hover:text-accent-primary/80"
                    >
                      Finding 열기
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="flex flex-wrap gap-2"
                data-testid="cluster-execution-empty"
              >
                {canMutate && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => setCreateFindingOpen(true)}
                    data-testid="cluster-execution-create-finding"
                  >
                    Finding 생성
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setLinkFindingOpen(true)}
                  disabled={!canMutate}
                  data-testid="cluster-link-existing-finding-button"
                >
                  기존 Finding 연결
                </Button>
              </div>
            )}
          </section>

          <SectionDivider />

          {/* Member VOC list */}
          <section className="flex flex-col gap-3" data-anchor="members">
            <div className="flex items-center justify-between">
              <PanelSectionTitle>멤버 VOC ({members.length})</PanelSectionTitle>
              {canMutate && data.status === "draft" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAddVocOpen(true)}
                  data-testid="cluster-add-voc-button"
                >
                  <Plus className="h-3.5 w-3.5" />
                  VOC 추가
                </Button>
              )}
            </div>

            {members.length === 0 ? (
              <div
                className="rounded-md border border-dashed border-border-subtle bg-surface-card p-6 flex items-center justify-center text-sm text-text-muted"
                data-testid="cluster-members-empty"
              >
                아직 VOC가 없습니다.
              </div>
            ) : (
              <div
                data-testid="cluster-members-list"
                className="overflow-hidden rounded-md border border-border-subtle bg-surface-card"
              >
                {members.slice(0, 4).map((member, i) => (
                  <MemberRow
                    key={member.voc_id}
                    member={member}
                    last={i === Math.min(members.length, 4) - 1}
                    canRemove={canMutate && data.status === "draft"}
                    onRemove={() => handleRemoveMember(member.voc_id)}
                    isRemoving={
                      removeMemberMutation.isPending &&
                      removeMemberMutation.variables?.vocId === member.voc_id
                    }
                  />
                ))}
                {members.length > 4 && (
                  <div
                    className="border-t border-border-subtle px-4 py-2 text-xs text-text-muted"
                    data-testid="cluster-members-more"
                  >
                    +{members.length - 4} 더보기
                  </div>
                )}
              </div>
            )}
          </section>

          <SectionDivider />

          <section className="flex flex-col gap-2" data-anchor="properties">
            <PanelSectionTitle>Properties</PanelSectionTitle>
            <FieldRow label="Managed System" className="px-0">
              <span data-testid="cluster-detail-managed-system">
                <ManagedSystemPill
                  name={managedSystem?.name ?? "Managed System"}
                  {...(managedSystem?.mark ? { mark: managedSystem.mark } : {})}
                  {...(managedSystem
                    ? { archived: managedSystem.archived }
                    : {})}
                />
              </span>
            </FieldRow>
            <FieldRow label="Severity" className="px-0">
              <span data-testid="cluster-detail-severity">
                {data.severity ?? "미지정"}
              </span>
            </FieldRow>
            <FieldRow label="Confidence" className="px-0">
              <span data-testid="cluster-detail-confidence">
                {data.confidence ?? "미지정"}
              </span>
            </FieldRow>
            <FieldRow label="Owner" className="px-0">
              <span data-testid="cluster-detail-owner">
                {data.owner_user_id ?? "담당자 없음"}
              </span>
            </FieldRow>
            <FieldRow label="Confirmed by" className="px-0">
              <span data-testid="cluster-detail-confirmed-by">
                {data.confirmed_by ?? "대기 중"}
              </span>
            </FieldRow>
            <FieldRow label="Confirmed at" className="px-0">
              <span data-testid="cluster-detail-confirmed-at">
                {data.confirmed_at ? formatDate(data.confirmed_at) : "대기 중"}
              </span>
            </FieldRow>
          </section>
        </div>
      </div>

      {/* CTA footer */}
      <div
        className="sticky bottom-0 bg-surface-canvas border-t border-border-subtle px-6 py-3 flex flex-wrap items-center gap-2"
        data-testid="cluster-cta-footer"
      >
        {canMutate ? (
          <>
            {/* Confirm button — only shown when draft */}
            {data.status === "draft" && (
              <Button
                variant="default"
                size="sm"
                onClick={handleConfirm}
                disabled={confirmMutation.isPending}
                data-testid="cluster-confirm-button"
              >
                확정
              </Button>
            )}
            {/* Create Finding CTA */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreateFindingOpen(true)}
              data-testid="cluster-create-finding-button"
            >
              Finding 생성
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRequestTaskOpen(true)}
              data-testid="cluster-request-task-button"
            >
              Task 요청
            </Button>
          </>
        ) : (
          <span
            className="text-xs text-text-muted"
            data-testid="cluster-cta-hint"
          >
            Admin 또는 Developer 권한이 있어야 클러스터를 관리할 수 있습니다.
          </span>
        )}
      </div>

      {/* Add VOC modal */}
      {canMutate && (
        <AddVocModal
          open={addVocOpen}
          clusterId={clusterId}
          onClose={() => setAddVocOpen(false)}
        />
      )}

      {/* Create Finding modal */}
      {canMutate && (
        <CreateFindingFromClusterModal
          open={createFindingOpen}
          clusterId={clusterId}
          onClose={() => setCreateFindingOpen(false)}
        />
      )}
      {canMutate && (
        <LinkExistingFindingModal
          open={linkFindingOpen}
          clusterId={clusterId}
          onClose={() => setLinkFindingOpen(false)}
        />
      )}
      {canMutate && (
        <RequestTaskModal
          open={requestTaskOpen}
          evidenceSummaryDefault={data.summary ?? data.title}
          isSubmitting={requestTaskMutation.isPending}
          onClose={closeRequestTaskModal}
          onSubmit={(values) => {
            requestTaskMutation.mutate(values, {
              onSuccess: () => {
                markRequestTaskConsumed();
                setRequestTaskOpen(false);
                requestTaskMutation.reset();
                toast.success("Task Request가 생성되었습니다.");
              },
            });
          }}
        />
      )}
    </aside>
  );
}

// ── Member row ────────────────────────────────────────────────────────────────

function MemberRow({
  member,
  last,
  canRemove,
  onRemove,
  isRemoving,
}: {
  member: VocClusterMemberPresentation;
  last: boolean;
  canRemove: boolean;
  onRemove: () => void;
  isRemoving: boolean;
}): React.ReactElement {
  const display = memberDisplay(member);

  return (
    <EntityRelationRow
      testId={`cluster-member-row-${member.voc_id}`}
      {...(last ? {} : { className: "border-b border-border-subtle" })}
      member={{
          vocId: member.voc_id,
          displayId: display.secondary,
          title: (
            <Link
              to="/vocs"
              search={{ view: "inbox", selected: member.voc_id }}
              className="text-accent-primary underline underline-offset-2 hover:text-accent-primary/80"
              data-testid={`cluster-member-link-${member.voc_id}`}
            >
              {display.primary}
            </Link>
          ),
          severity: member.severity ?? null,
          reporterStatus:
            (member.reporter_facing_status as
              | Parameters<typeof ReporterStatusBadge>[0]["status"]
              | undefined) ?? null,
          trailing: canRemove ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRemove}
              disabled={isRemoving}
              data-testid={`cluster-member-remove-${member.voc_id}`}
              aria-label="VOC 제거"
            >
              <Trash2 className="h-3.5 w-3.5 text-text-muted" />
            </Button>
          ) : null,
      }}
    />
  );
}

function LinkExistingFindingModal({
  open,
  clusterId,
  onClose,
}: {
  open: boolean;
  clusterId: string;
  onClose: () => void;
}): React.ReactElement {
  const [findingId, setFindingId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const findings = useFindingsList();
  const { key, markConsumed } = useIdempotencyKey();
  const mutation = useLinkExistingFindingToVocCluster({ idempotencyKey: key });
  function closeAndReset() {
    setFindingId("");
    setError(null);
    mutation.reset();
    onClose();
  }
  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    mutation.mutate(
      { clusterId, findingId },
      {
        onSuccess: () => {
          markConsumed();
          toast.success("Finding이 클러스터에 연결되었습니다.");
          closeAndReset();
        },
        onError: (err: ApiError) => {
          const message = errorMapper(err.envelope).message;
          setError(message);
          toast.error(message);
        },
      },
    );
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) closeAndReset();
      }}
    >
      <DialogContent data-testid="link-existing-finding-modal">
        <DialogHeader>
          <DialogTitle>기존 Finding 연결</DialogTitle>
        </DialogHeader>
        <form
          id="link-existing-finding-form"
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
        >
          <Label htmlFor="cluster-finding-picker">Finding</Label>
          {findings.isLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : findings.isError ? (
            <p className="text-sm text-accent-danger">
              연결 가능한 Finding을 불러오지 못했습니다.
            </p>
          ) : (
            <select
              id="cluster-finding-picker"
              required
              value={findingId}
              onChange={(event) => setFindingId(event.target.value)}
              data-testid="link-existing-finding-picker"
              className="h-9 w-full rounded-md border border-border-default bg-surface-field px-3 py-1 text-sm text-text-primary"
            >
              <option value="">연결할 Finding을 선택하세요.</option>
              {(findings.data?.items ?? []).map((finding) => (
                <option key={finding.id} value={finding.id}>
                  {finding.display_id} · {finding.title}
                </option>
              ))}
            </select>
          )}
          {error && (
            <p
              data-testid="link-existing-finding-error"
              className="text-sm text-accent-danger"
            >
              {error}
            </p>
          )}
        </form>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={closeAndReset}
            disabled={mutation.isPending}
          >
            취소
          </Button>
          <Button
            type="submit"
            form="link-existing-finding-form"
            disabled={mutation.isPending || !findingId}
            data-testid="link-existing-finding-submit"
          >
            연결
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add VOC modal ─────────────────────────────────────────────────────────────

function AddVocModal({
  open,
  clusterId,
  onClose,
}: {
  open: boolean;
  clusterId: string;
  onClose: () => void;
}): React.ReactElement {
  const [vocId, setVocId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useAddClusterMember();
  const candidatePeers = useCandidatePeers(clusterId);

  function closeAndReset() {
    setVocId("");
    setError(null);
    mutation.reset();
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    mutation.mutate(
      { clusterId, vocId },
      {
        onSuccess: () => {
          toast.success("VOC가 클러스터에 추가되었습니다.");
          closeAndReset();
        },
        onError: (err: ApiError) => {
          const msg = errorMapper(err.envelope).message;
          setError(msg);
          toast.error(msg);
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) closeAndReset();
      }}
    >
      <DialogContent data-testid="add-voc-modal">
        <DialogHeader>
          <DialogTitle>VOC 추가</DialogTitle>
        </DialogHeader>
        <form
          id="add-voc-form"
          data-testid="add-voc-form"
          className="flex flex-col gap-4"
          onSubmit={handleSubmit}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-voc-candidate" className="text-text-secondary">
              추가할 VOC <span aria-hidden>*</span>
            </Label>
            {candidatePeers.isLoading ? (
              <Skeleton
                className="h-9 w-full"
                data-testid="candidate-peers-loading"
              />
            ) : candidatePeers.isError ? (
              <p
                className="text-sm text-accent-danger"
                data-testid="candidate-peers-error"
              >
                추가 가능한 VOC를 불러오지 못했습니다.
              </p>
            ) : (
              <select
                id="add-voc-candidate"
                required
                value={vocId}
                onChange={(e) => setVocId(e.target.value)}
                data-testid="add-voc-candidate-picker"
                className="h-9 w-full rounded-md border border-border-default bg-surface-field px-3 py-1 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">추가할 VOC를 선택하세요.</option>
                {(candidatePeers.data?.candidates ?? []).map((candidate) => (
                  <option key={candidate.voc_id} value={candidate.voc_id}>
                    {candidate.display_id} · {candidate.title} ·{" "}
                    {candidate.severity ?? "미지정"} ·{" "}
                    {candidate.reporter_facing_status}
                  </option>
                ))}
              </select>
            )}
          </div>
          {error && (
            <p
              data-testid="add-voc-error"
              className="text-sm text-accent-danger"
            >
              {error}
            </p>
          )}
        </form>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={closeAndReset}
            disabled={mutation.isPending}
            data-testid="add-voc-cancel"
          >
            취소
          </Button>
          <Button
            type="submit"
            form="add-voc-form"
            disabled={mutation.isPending || !vocId}
            data-testid="add-voc-submit"
          >
            추가
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Create Finding from Cluster modal ─────────────────────────────────────────

function CreateFindingFromClusterModal({
  open,
  clusterId,
  onClose,
}: {
  open: boolean;
  clusterId: string;
  onClose: () => void;
}): React.ReactElement {
  const navigate = useNavigate();
  const { key: idempotencyKey, markConsumed } = useIdempotencyKey();
  const mutation = useCreateFindingFromCluster({ idempotencyKey });

  const form = useForm<CreateFindingRequest>({
    resolver: zodResolver(createFindingRequestSchema),
    defaultValues: {
      title: "",
      summary: "",
      severity: "medium",
    },
    mode: "onBlur",
  });

  function closeAndReset() {
    form.reset();
    mutation.reset();
    onClose();
  }

  function handleSubmit(values: CreateFindingRequest) {
    mutation.mutate(
      { clusterId, body: values },
      {
        onSuccess: (finding) => {
          markConsumed();
          form.reset();
          mutation.reset();
          onClose();
          void navigate({
            to: "/findings/$findingId",
            params: { findingId: finding.id },
          });
        },
        onError: (err: ApiError) => {
          toast.error(errorMapper(err.envelope).message);
        },
      },
    );
  }

  const isSubmitting = mutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) closeAndReset();
      }}
    >
      <DialogContent
        className="max-w-lg"
        data-testid="create-finding-from-cluster-modal"
      >
        <DialogHeader>
          <DialogTitle>Finding 생성</DialogTitle>
        </DialogHeader>

        <form
          id="create-finding-from-cluster-form"
          data-testid="create-finding-from-cluster-form"
          onSubmit={form.handleSubmit(handleSubmit)}
          noValidate
          className="flex flex-col gap-4"
        >
          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel required htmlFor="cluster-finding-title">
              제목
            </FieldLabel>
            <Input
              id="cluster-finding-title"
              placeholder="Finding을 한 줄로 요약하세요."
              {...form.register("title")}
              aria-invalid={Boolean(form.formState.errors.title)}
              data-testid="cluster-finding-title-input"
            />
            {form.formState.errors.title?.message && (
              <p className="text-xs text-text-danger" role="alert">
                {form.formState.errors.title.message}
              </p>
            )}
          </div>

          {/* Summary */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel required htmlFor="cluster-finding-summary">
              요약
            </FieldLabel>
            <Textarea
              id="cluster-finding-summary"
              placeholder="어떤 문제가 있고 왜 실행해야 하는지 설명하세요."
              rows={4}
              {...form.register("summary")}
              aria-invalid={Boolean(form.formState.errors.summary)}
              data-testid="cluster-finding-summary-input"
            />
            {form.formState.errors.summary?.message && (
              <p className="text-xs text-text-danger" role="alert">
                {form.formState.errors.summary.message}
              </p>
            )}
          </div>

          {/* Severity */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel required htmlFor="cluster-finding-severity">
              심각도
            </FieldLabel>
            <Select
              defaultValue="medium"
              onValueChange={(val) =>
                form.setValue("severity", val as FindingSeverity, {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger
                id="cluster-finding-severity"
                data-testid="cluster-finding-severity-select"
              >
                <SelectValue placeholder="심각도 선택" />
              </SelectTrigger>
              <SelectContent>
                {SEVERITY_OPTIONS.map((opt) => (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    data-testid={`severity-option-${opt.value}`}
                  >
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.severity?.message && (
              <p className="text-xs text-text-danger" role="alert">
                {form.formState.errors.severity.message}
              </p>
            )}
          </div>
        </form>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={closeAndReset}
            disabled={isSubmitting}
            data-testid="create-finding-from-cluster-cancel"
          >
            취소
          </Button>
          <Button
            type="submit"
            form="create-finding-from-cluster-form"
            disabled={isSubmitting}
            data-testid="create-finding-from-cluster-submit"
          >
            Finding 생성
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
