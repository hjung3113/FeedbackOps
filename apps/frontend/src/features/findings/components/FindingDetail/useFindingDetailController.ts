// useFindingDetailController — state machine behind FullFindingDetail.
// Owns modal open/close state, the detail queries (managed systems, analytics
// areas, linked task, linked VOC, actors, permission check), derived lookups,
// and the status mutation handler. Request Task execution state lives in
// useFindingExecutionSection; rendering lives in FullFindingDetail.

import { useVocClusterDetail } from '@/features/voc-cluster/hooks/useVocClusterDetail';
import { type ApiError, errorMapper, getTask, useIdempotencyKey } from '@/lib/api';
import { useMe } from '@/lib/auth/useMe';
import { analyticsAreasCatalogQuery } from '@/lib/cross-system/analyticsAreasCatalog';
import { managedSystemsCatalogQuery } from '@/lib/cross-system/useManagedSystemNames';
import { usePermissionCheck } from '@/lib/cross-system/usePermissionCheck';
import { useVocDetail } from '@/lib/cross-system/useVocDetail';
import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import type { FindingDto, TaskDetailDto } from '@fops/shared';
import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { toast } from 'sonner';
import { useFindingStatusMutation } from '../../hooks/useFindingStatusMutation';

export interface FindingDetailController {
  sections: { id: string; label: string }[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  addEvidenceOpen: boolean;
  setAddEvidenceOpen: (open: boolean) => void;
  linkEvidenceOpen: boolean;
  setLinkEvidenceOpen: (open: boolean) => void;
  linkTaskOpen: boolean;
  setLinkTaskOpen: (open: boolean) => void;
  actorsById: Map<string, string>;
  /** Owner-picker candidates: Admin/Developer actors only, never User-level or the System audit actor. */
  eligibleOwners: Array<{ id: string; name: string }>;
  managedSystemsById: Map<string, string>;
  analyticsAreasById: Map<string, string>;
  linkedVocTitle: string | null;
  linkedVocDisplayId: string | null;
  /** Source Cluster display data for `voc_cluster`-sourced Findings (#1174b). */
  linkedClusterTitle: string | null;
  linkedClusterDisplayId: string | null;
  linkedTaskQuery: UseQueryResult<TaskDetailDto>;
  canManage: boolean;
  handleMarkNotActionable: () => void;
  markNotActionableDisabled: boolean;
}

// ADR-0057 A2 amendment keeps navigation Korean and entity nouns English.
export const DETAIL_SECTIONS = [
  { id: 'summary', label: '요약' },
  { id: 'metadata', label: '소스 / 심각도 / 신뢰도' },
  { id: 'execution', label: '실행' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'managed-system', label: 'Managed System' },
  { id: 'analytics-area', label: 'Analytics Area' },
  { id: 'links', label: '연결' },
  { id: 'notes', label: '진행 메모' },
];

// The workspace audit identity (backend seed: actor_type 'system', audit
// authorship only, never an interactive login) must never be offered as an
// owner. The shipped GET /actors read exposes role_level but not actor_type,
// so the FE excludes it by its reserved provisioning email; the PATCH 422
// (ineligible_actor) stays authoritative if one slips through.
const SYSTEM_ACTOR_EMAIL = 'system@feedbackops.local';

export function useFindingDetailController(finding: FindingDto): FindingDetailController {
  const [addEvidenceOpen, setAddEvidenceOpen] = React.useState(false);
  const [linkEvidenceOpen, setLinkEvidenceOpen] = React.useState(false);
  const [linkTaskOpen, setLinkTaskOpen] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const { actors } = useWorkspaceActors();
  const actorsById = React.useMemo(
    () => new Map((actors ?? []).map((actor) => [actor.id, actor.display_name])),
    [actors],
  );
  const eligibleOwners = React.useMemo(
    () =>
      (actors ?? [])
        .filter((actor) => actor.role_level !== 'user' && actor.email !== SYSTEM_ACTOR_EMAIL)
        .map((actor) => ({ id: actor.id, name: actor.display_name })),
    [actors],
  );
  const managedSystemsQuery = useQuery(managedSystemsCatalogQuery());
  const managedSystemsById = React.useMemo(
    () => new Map((managedSystemsQuery.data?.items ?? []).map((ms) => [ms.id, ms.name])),
    [managedSystemsQuery.data?.items],
  );
  const analyticsAreasQuery = useQuery(
    analyticsAreasCatalogQuery(finding.primary_managed_system_id),
  );
  const analyticsAreasById = React.useMemo(
    () => new Map((analyticsAreasQuery.data?.items ?? []).map((area) => [area.id, area.name])),
    [analyticsAreasQuery.data?.items],
  );
  const linkedVocQuery = useVocDetail(finding.source_type === 'voc' ? finding.source_id : null);
  const linkedTaskQuery = useQuery({
    queryKey: ['task', finding.linked_task_id] as const,
    queryFn: ({ signal }) => getTask(finding.linked_task_id as string, signal),
    enabled: finding.linked_task_id !== null,
    staleTime: 30 * 1000,
  });
  const linkedVocTitle =
    linkedVocQuery.data && 'title' in linkedVocQuery.data ? linkedVocQuery.data.title : null;
  const linkedVocDisplayId =
    linkedVocQuery.data && 'display_id' in linkedVocQuery.data
      ? linkedVocQuery.data.display_id
      : null;
  // #1174b U2-2: mirror the linked-VOC read for a Cluster source; a denied or
  // not-found read leaves both fields null so the UI renders the safe fallback.
  const linkedClusterQuery = useVocClusterDetail(
    finding.source_type === 'voc_cluster' && finding.source_id !== null ? finding.source_id : null,
  );
  // #1174 FIX1: TanStack Query keeps cached `data` when a refetch errors, so
  // project the identity only from a successful read — a previously readable
  // Cluster must not stay named or linked after its read turns denied/not-found.
  const linkedClusterTitle = linkedClusterQuery.isSuccess
    ? (linkedClusterQuery.data?.title ?? null)
    : null;
  const linkedClusterDisplayId = linkedClusterQuery.isSuccess
    ? (linkedClusterQuery.data?.display_id ?? null)
    : null;
  const { key: statusIdempotencyKey, markConsumed: markStatusKeyConsumed } = useIdempotencyKey();
  const { data: me } = useMe();
  const managePermissionQuery = usePermissionCheck({
    capability: 'finding.manage',
    managedSystemId: finding.primary_managed_system_id,
  });

  // finding.manage gates both CTAs (display hint only — backend is authoritative).
  const canManage =
    me?.actor.role_level === 'admin' || managePermissionQuery.data?.state === 'approved';
  const statusMutation = useFindingStatusMutation({
    findingId: finding.id,
    idempotencyKey: statusIdempotencyKey,
    onError: (err: ApiError) => {
      toast.error(errorMapper(err.envelope).message);
    },
  });

  function handleMarkNotActionable(): void {
    statusMutation.mutate(
      { status: 'not_actionable' },
      {
        onSuccess: () => {
          markStatusKeyConsumed();
          toast.success('Finding이 조치 불필요로 표시되었습니다.');
        },
      },
    );
  }

  const markNotActionableDisabled =
    !canManage ||
    statusMutation.isPending ||
    finding.status === 'not_actionable' ||
    finding.status === 'converted' ||
    finding.status === 'archived';

  return {
    sections: DETAIL_SECTIONS,
    scrollRef,
    addEvidenceOpen,
    setAddEvidenceOpen,
    linkEvidenceOpen,
    setLinkEvidenceOpen,
    linkTaskOpen,
    setLinkTaskOpen,
    actorsById,
    eligibleOwners,
    managedSystemsById,
    analyticsAreasById,
    linkedVocTitle,
    linkedVocDisplayId,
    linkedClusterTitle,
    linkedClusterDisplayId,
    linkedTaskQuery,
    canManage,
    handleMarkNotActionable,
    markNotActionableDisabled,
  };
}
