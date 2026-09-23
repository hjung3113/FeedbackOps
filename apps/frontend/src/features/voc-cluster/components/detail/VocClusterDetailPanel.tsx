// VOC Cluster detail panel: detail query, role gate, Execution / Members /
// Properties sections, CTA footer, and the cross-system modal mounts. Modal
// hooks stay inside the modals — lifting them would fetch pickers before the
// detail data loads and change mount behavior.

import type { LinkedFindingDto } from '@fops/shared';
import {
  Button,
  DetailPanelHeader,
  DetailPanelSectionNav,
  FieldRow,
  ManagedSystemPill,
  OutlineBadge,
  PanelSectionTitle,
  type ReporterStatusBadge,
  SeverityBadge,
  Skeleton,
} from '@fops/ui';
import { Link, useNavigate } from '@tanstack/react-router';
import { Plus, Trash2 } from 'lucide-react';
import * as React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';

import { EntityRelationRow } from '@/features/integration/components/EntityRelationRow';
import { RequestTaskModal } from '@/features/tasks/components/RequestTaskModal';
import { useConfirmCluster } from '@/features/voc-cluster/hooks/useConfirmCluster';
import { useRemoveClusterMember } from '@/features/voc-cluster/hooks/useRemoveClusterMember';
import { useRequestTaskFromCluster } from '@/features/voc-cluster/hooks/useRequestTaskFromCluster';
import { useVocClusterDetail } from '@/features/voc-cluster/hooks/useVocClusterDetail';
import { useManagedSystem } from '@/features/voc/hooks/useManagedSystem';
import { type ApiError, errorMapper, useIdempotencyKey } from '@/lib/api';
import { useMe } from '@/lib/auth/useMe';

import { ClusterStatusBadge, formatClusterDate, shortId } from '../../lib/presentation';
import { AddVocModal } from '../modals/AddVocModal';
import { CreateFindingFromClusterModal } from '../modals/CreateFindingFromClusterModal';
import { LinkExistingFindingModal } from '../modals/LinkExistingFindingModal';
import type { VocClusterDetailPresentation, VocClusterMemberPresentation } from '../types';

function SectionDivider(): React.ReactElement {
  return <hr className="border-border-subtle" />;
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
      secondary: member.display_id?.trim() ? member.display_id : shortId(member.voc_id),
    };
  }
  if (member.display_id?.trim()) {
    return { primary: member.display_id, secondary: shortId(member.voc_id) };
  }
  return { primary: 'VOC', secondary: shortId(member.voc_id) };
}

export function VocClusterDetailPanel({
  clusterId,
  onClose,
}: {
  clusterId: string;
  onClose?: () => void;
}): React.ReactElement {
  const { data, isLoading, isError, error } = useVocClusterDetail(clusterId);
  const presentation = data as (typeof data & VocClusterDetailPresentation) | undefined;
  const managedSystem = useManagedSystem(data?.primary_managed_system_id);
  const { data: me } = useMe();
  const canMutate = me?.actor.role_level === 'admin' || me?.actor.role_level === 'developer';

  const [addVocOpen, setAddVocOpen] = useState(false);
  const [createFindingOpen, setCreateFindingOpen] = useState(false);
  const [linkFindingOpen, setLinkFindingOpen] = useState(false);
  const [requestTaskOpen, setRequestTaskOpen] = useState(false);
  const { key: requestTaskIdempotencyKey, markConsumed: markRequestTaskConsumed } =
    useIdempotencyKey();

  const confirmMutation = useConfirmCluster();
  const removeMemberMutation = useRemoveClusterMember();
  const requestTaskMutation = useRequestTaskFromCluster({
    clusterId,
    idempotencyKey: requestTaskIdempotencyKey,
    onError: (err: ApiError) => toast.error(errorMapper(err.envelope).message),
  });
  const navigate = useNavigate();
  const sectionScrollRef = React.useRef<HTMLDivElement>(null);

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
          {code === 'not_found.record'
            ? '클러스터를 찾을 수 없습니다.'
            : '데이터를 불러오지 못했습니다.'}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => void navigate({ to: '/voc-clusters' })}
        >
          목록으로
        </Button>
      </div>
    );
  }

  const members: VocClusterMemberPresentation[] = presentation?.members ?? [];
  const linkedFindings = presentation?.linked_findings ?? [];

  function handleConfirm() {
    confirmMutation.mutate(clusterId, {
      onSuccess: () => toast.success('클러스터가 확정되었습니다.'),
      onError: (err: ApiError) => toast.error(errorMapper(err.envelope).message),
    });
  }

  function handleRemoveMember(vocId: string) {
    removeMemberMutation.mutate(
      { clusterId, vocId },
      {
        onSuccess: () => toast.success('VOC가 클러스터에서 제거되었습니다.'),
        onError: (err: ApiError) => toast.error(errorMapper(err.envelope).message),
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
        onClose={onClose ?? (() => void navigate({ to: '/voc-clusters' }))}
      />
      <DetailPanelSectionNav
        scrollRef={sectionScrollRef}
        sections={[
          { id: 'overview', label: 'Overview' },
          { id: 'why', label: 'Why' },
          { id: 'execution', label: 'Execution' },
          { id: 'members', label: 'Members', count: data.member_count },
          { id: 'properties', label: 'Properties' },
        ]}
      />
      <div ref={sectionScrollRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="flex flex-col gap-6">
          <section data-anchor="overview" className="flex flex-col gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <OutlineBadge>VOC Cluster</OutlineBadge>
                <ClusterStatusBadge status={data.status} surface="detail" />
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
              <p className="text-sm text-text-muted" data-testid="cluster-detail-summary-empty">
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
              <p className="text-sm text-text-muted" data-testid="cluster-detail-rationale-empty">
                그룹화 이유가 없습니다.
              </p>
            )}
          </section>

          <SectionDivider />

          <section className="flex flex-col gap-3" data-anchor="execution">
            <PanelSectionTitle>실행</PanelSectionTitle>
            {linkedFindings.length > 0 ? (
              <div className="flex flex-col gap-2" data-testid="cluster-linked-findings-list">
                {linkedFindings.map((finding) => (
                  <div
                    key={finding.id}
                    className="flex flex-col gap-2 rounded-md border border-border-subtle bg-surface-card p-4"
                    data-testid={`cluster-linked-finding-${finding.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <OutlineBadge data-testid={`finding-status-badge-${finding.status}`}>
                        {finding.status}
                      </OutlineBadge>
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs text-text-muted">{finding.display_id}</span>
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
              <div className="flex flex-wrap gap-2" data-testid="cluster-execution-empty">
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
              {canMutate && data.status === 'draft' && (
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
                    canRemove={canMutate && data.status === 'draft'}
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
                  name={managedSystem?.name ?? 'Managed System'}
                  {...(managedSystem?.mark ? { mark: managedSystem.mark } : {})}
                  {...(managedSystem ? { archived: managedSystem.archived } : {})}
                />
              </span>
            </FieldRow>
            <FieldRow label="Severity" className="px-0">
              <span data-testid="cluster-detail-severity">{data.severity ?? '미지정'}</span>
            </FieldRow>
            <FieldRow label="Confidence" className="px-0">
              <span data-testid="cluster-detail-confidence">{data.confidence ?? '미지정'}</span>
            </FieldRow>
            <FieldRow label="Owner" className="px-0">
              <span data-testid="cluster-detail-owner">{data.owner_user_id ?? '담당자 없음'}</span>
            </FieldRow>
            <FieldRow label="Confirmed by" className="px-0">
              <span data-testid="cluster-detail-confirmed-by">
                {data.confirmed_by ?? '대기 중'}
              </span>
            </FieldRow>
            <FieldRow label="Confirmed at" className="px-0">
              <span data-testid="cluster-detail-confirmed-at">
                {data.confirmed_at ? formatClusterDate(data.confirmed_at) : '대기 중'}
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
            {data.status === 'draft' && (
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
          <span className="text-xs text-text-muted" data-testid="cluster-cta-hint">
            Admin 또는 Developer 권한이 있어야 클러스터를 관리할 수 있습니다.
          </span>
        )}
      </div>

      {/* Add VOC modal */}
      {canMutate && (
        <AddVocModal
          open={addVocOpen}
          clusterId={clusterId}
          members={members}
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
          source={{ type: 'voc_cluster', id: clusterId }}
          onClose={closeRequestTaskModal}
          onSubmit={(values) => {
            requestTaskMutation.mutate(values, {
              onSuccess: () => {
                markRequestTaskConsumed();
                setRequestTaskOpen(false);
                requestTaskMutation.reset();
                toast.success('Task Request가 생성되었습니다.');
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
      {...(last ? {} : { className: 'border-b border-border-subtle' })}
      member={{
        vocId: member.voc_id,
        displayId: display.secondary,
        title: (
          <Link
            to="/vocs"
            search={{ view: 'inbox', selected: member.voc_id }}
            className="text-accent-primary underline underline-offset-2 hover:text-accent-primary/80"
            data-testid={`cluster-member-link-${member.voc_id}`}
          >
            {display.primary}
          </Link>
        ),
        severity: member.severity ?? null,
        reporterStatus:
          (member.reporter_facing_status as
            | Parameters<typeof ReporterStatusBadge>[0]['status']
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
