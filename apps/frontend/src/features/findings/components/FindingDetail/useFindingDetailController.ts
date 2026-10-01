// useFindingDetailController — state machine behind FullFindingDetail.
// Owns modal open/close state, the detail queries (managed systems, analytics
// areas, linked Task Request, linked task, linked VOC, actors, permission check),
// derived lookups, and the status mutation handler. Rendering lives in FullFindingDetail.

import { type ApiError, errorMapper, getTask, useIdempotencyKey } from '@/lib/api';
import { fetchAnalyticsAreas } from '@/lib/api/analytics-areas';
import { fetchEntityLinksBySource } from '@/lib/api/entity-links';
import { fetchManagedSystems } from '@/lib/api/managed-systems';
import { useMe } from '@/lib/auth/useMe';
import { usePermissionCheck } from '@/lib/cross-system/usePermissionCheck';
import { useVocDetail } from '@/lib/cross-system/useVocDetail';
import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import {
  type EntityLinkTargetSummary,
  type FindingDto,
  type ListEntityLinksResponse,
  type TaskDetailDto,
  type TaskRequestStatus,
  taskRequestStatusSchema,
} from '@fops/shared';
import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { toast } from 'sonner';
import { useFindingStatusMutation } from '../../hooks/useFindingStatusMutation';

export type RequestedTaskRequestSummary = Extract<
  EntityLinkTargetSummary,
  { type: 'task_request' }
> & { status: TaskRequestStatus };

export function requestedTaskRequestsFromEntityLinks(
  findingId: string,
  response: ListEntityLinksResponse,
): RequestedTaskRequestSummary[] {
  const requests: RequestedTaskRequestSummary[] = [];
  for (const link of response.items) {
    if (
      link.visibility_state !== 'allowed' ||
      link.status !== 'active' ||
      link.source_type !== 'finding' ||
      link.source_id !== findingId ||
      link.target_type !== 'task_request' ||
      link.relation_type !== 'requested_task' ||
      link.target_summary?.type !== 'task_request' ||
      link.target_summary.id !== link.target_id
    ) {
      continue;
    }
    const status = taskRequestStatusSchema.safeParse(link.target_summary.status);
    if (status.success) requests.push({ ...link.target_summary, status: status.data });
  }
  return requests;
}

export interface FindingDetailController {
  sections: { id: string; label: string }[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  addEvidenceOpen: boolean;
  setAddEvidenceOpen: (open: boolean) => void;
  linkEvidenceOpen: boolean;
  setLinkEvidenceOpen: (open: boolean) => void;
  requestTaskOpen: boolean;
  setRequestTaskOpen: (open: boolean) => void;
  linkTaskOpen: boolean;
  setLinkTaskOpen: (open: boolean) => void;
  actorsById: Map<string, string>;
  managedSystemsById: Map<string, string>;
  analyticsAreasById: Map<string, string>;
  linkedVocTitle: string | null;
  linkedVocDisplayId: string | null;
  linkedTaskQuery: UseQueryResult<TaskDetailDto>;
  requestedTaskRequests: RequestedTaskRequestSummary[];
  requestedTaskRequestsState: 'loading' | 'error' | 'loaded';
  retryRequestedTaskRequests: () => void;
  canManage: boolean;
  handleMarkNotActionable: () => void;
  markNotActionableDisabled: boolean;
}

const DETAIL_SECTIONS = [
  { id: 'summary', label: '요약' },
  { id: 'metadata', label: '소스/심각도/신뢰도' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'managed-system', label: 'Managed System' },
  { id: 'analytics-area', label: 'Analytics Area' },
  { id: 'links', label: '연결' },
  { id: 'notes', label: '진행 메모' },
];

export function useFindingDetailController(finding: FindingDto): FindingDetailController {
  const [addEvidenceOpen, setAddEvidenceOpen] = React.useState(false);
  const [linkEvidenceOpen, setLinkEvidenceOpen] = React.useState(false);
  const [requestTaskOpen, setRequestTaskOpen] = React.useState(false);
  const [linkTaskOpen, setLinkTaskOpen] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const { actors } = useWorkspaceActors();
  const actorsById = React.useMemo(
    () => new Map((actors ?? []).map((actor) => [actor.id, actor.display_name])),
    [actors],
  );
  const managedSystemsQuery = useQuery({
    queryKey: ['managed-systems', 'all'] as const,
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived: true, signal }),
    staleTime: 10 * 60 * 1000,
  });
  const managedSystemsById = React.useMemo(
    () => new Map((managedSystemsQuery.data?.items ?? []).map((ms) => [ms.id, ms.name])),
    [managedSystemsQuery.data?.items],
  );
  const analyticsAreasQuery = useQuery({
    queryKey: ['analytics-areas', finding.primary_managed_system_id] as const,
    queryFn: ({ signal }) =>
      fetchAnalyticsAreas({
        managedSystemId: finding.primary_managed_system_id,
        includeArchived: true,
        signal,
      }),
    staleTime: 10 * 60 * 1000,
  });
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
  const requestedTaskRequestQuery = useQuery({
    queryKey: ['entity-links', 'finding', finding.id, 'requested_task'] as const,
    queryFn: ({ signal }) => fetchEntityLinksBySource('finding', finding.id, { signal }),
    select: (response) => requestedTaskRequestsFromEntityLinks(finding.id, response),
    staleTime: 30 * 1000,
    retry: false,
  });
  const linkedVocTitle =
    linkedVocQuery.data && 'title' in linkedVocQuery.data ? linkedVocQuery.data.title : null;
  const linkedVocDisplayId =
    linkedVocQuery.data && 'display_id' in linkedVocQuery.data
      ? linkedVocQuery.data.display_id
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
    requestTaskOpen,
    setRequestTaskOpen,
    linkTaskOpen,
    setLinkTaskOpen,
    actorsById,
    managedSystemsById,
    analyticsAreasById,
    linkedVocTitle,
    linkedVocDisplayId,
    linkedTaskQuery,
    requestedTaskRequests: requestedTaskRequestQuery.isSuccess
      ? (requestedTaskRequestQuery.data ?? [])
      : [],
    requestedTaskRequestsState: requestedTaskRequestQuery.isError
      ? 'error'
      : requestedTaskRequestQuery.isPending
        ? 'loading'
        : 'loaded',
    retryRequestedTaskRequests: () => {
      void requestedTaskRequestQuery.refetch();
    },
    canManage,
    handleMarkNotActionable,
    markNotActionableDisabled,
  };
}
