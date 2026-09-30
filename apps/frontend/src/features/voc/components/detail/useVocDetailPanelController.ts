import { usePublicUpdateReviewCandidates } from '@/features/voc/hooks/usePublicUpdateReviewCandidates';
import { useRequestTaskFromVoc } from '@/features/voc/hooks/useRequestTaskFromVoc';
import { type ApiError, errorMapper, getTask, useIdempotencyKey } from '@/lib/api';
import { fetchAnalyticsAreas } from '@/lib/api/analytics-areas';
import type { MeResponse } from '@/lib/auth/useMe';
import { usePermissionCheck } from '@/lib/cross-system/usePermissionCheck';
import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import type { CreateTaskRequestRequest, EntityLinkDto, VocDetailEnvelope } from '@fops/shared';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import * as React from 'react';
import { toast } from 'sonner';
import { hasSimilarVocSection } from './SimilarVocSection';

type AllowedEntityLink = Extract<EntityLinkDto, { visibility_state: 'allowed' }>;

function isAllowedTaskLinkForVoc(link: EntityLinkDto, vocId: string): link is AllowedEntityLink {
  if (link.visibility_state !== 'allowed') return false;
  return (
    (link.source_type === 'voc' && link.source_id === vocId && link.target_type === 'task') ||
    (link.target_type === 'voc' && link.target_id === vocId && link.source_type === 'task')
  );
}

export function useVocDetailPanelController({
  voc,
  vocId,
  managedSystemId,
  onClose,
  canRenderAllowedTask,
  me,
}: {
  voc: VocDetailEnvelope;
  vocId: string;
  managedSystemId?: string;
  onClose: () => void;
  canRenderAllowedTask: boolean;
  me: MeResponse | null;
}) {
  // REV-1 #6: track composer dirty state; intercept panel close to show DirtyConfirmation.
  const [composerDirty, setComposerDirty] = React.useState(false);
  const [dirtyConfirmOpen, setDirtyConfirmOpen] = React.useState(false);
  const [createFindingOpen, setCreateFindingOpen] = React.useState(false);
  const [requestTaskOpen, setRequestTaskOpen] = React.useState(false);
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const navigate = useNavigate();
  const permissionManagedSystemId = managedSystemId ?? voc.primary_managed_system_id;
  const capCheck = usePermissionCheck({
    capability: 'voc.triage',
    managedSystemId: permissionManagedSystemId,
  });
  const readCheck = usePermissionCheck({
    capability: 'voc.read',
    managedSystemId: permissionManagedSystemId,
  });
  const canTriage = capCheck.data?.state === 'approved';
  const canSeeInternalOps = canTriage || readCheck.data?.state === 'approved';
  const { key: requestTaskIdempotencyKey, markConsumed: markRequestTaskConsumed } =
    useIdempotencyKey();
  // Scroll container ref for section nav anchor tracking
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const { actors } = useWorkspaceActors();
  const actorNamesById = React.useMemo(
    () => new Map((actors ?? []).map((actor) => [actor.id, actor.display_name])),
    [actors],
  );
  const analyticsAreasQuery = useQuery({
    queryKey: ['analytics-areas', voc.primary_managed_system_id] as const,
    queryFn: ({ signal }) =>
      fetchAnalyticsAreas({
        managedSystemId: voc.primary_managed_system_id,
        includeArchived: true,
        signal,
      }),
    staleTime: 10 * 60 * 1000,
  });
  const analyticsAreasById = React.useMemo(
    () => new Map((analyticsAreasQuery.data?.items ?? []).map((area) => [area.id, area.name])),
    [analyticsAreasQuery.data?.items],
  );
  const allowedTaskLink = voc.links?.find((link) => isAllowedTaskLinkForVoc(link, voc.id));
  const linkedTaskId =
    allowedTaskLink?.source_type === 'task'
      ? allowedTaskLink.source_id
      : allowedTaskLink?.target_type === 'task'
        ? allowedTaskLink.target_id
        : null;
  const linkedTaskQuery = useQuery({
    queryKey: ['task', linkedTaskId] as const,
    queryFn: ({ signal }) => getTask(linkedTaskId as string, signal),
    enabled: linkedTaskId !== null && canRenderAllowedTask,
    staleTime: 30 * 1000,
  });
  const linkedTask =
    canRenderAllowedTask && linkedTaskQuery.data !== undefined
      ? { title: linkedTaskQuery.data.title, status: linkedTaskQuery.data.status }
      : null;

  // FE display hint only (ADR-0024 §C): gate button to Admin or Developer.
  const canCreateFinding = me?.actor.role_level === 'admin' || me?.actor.role_level === 'developer';
  const reviewCandidates = usePublicUpdateReviewCandidates(voc.id, canCreateFinding);
  const pendingReviewCount = reviewCandidates.data?.items.length ?? 0;
  const canRequestTask = canCreateFinding;
  const showsSimilarVocSection = hasSimilarVocSection(voc.similar, voc.similar_count);
  const isReporterArm = voc.similar === undefined || voc.similar_count === undefined;

  const requestTaskMutation = useRequestTaskFromVoc({
    vocId,
    idempotencyKey: requestTaskIdempotencyKey,
    onError: (err: ApiError) => {
      toast.error(errorMapper(err.envelope).message);
    },
  });

  function handleClose() {
    if (composerDirty) {
      setDirtyConfirmOpen(true);
    } else {
      onClose();
    }
  }

  function handleDirtyConfirm() {
    setDirtyConfirmOpen(false);
    setComposerDirty(false);
    onClose();
  }

  function handleDirtyCancel() {
    setDirtyConfirmOpen(false);
  }

  function closeRequestTaskDraft(): void {
    requestTaskMutation.reset();
    setRequestTaskOpen(false);
  }

  function handleRequestTaskSubmit(values: CreateTaskRequestRequest): void {
    requestTaskMutation.mutate(values, {
      onSuccess: () => {
        markRequestTaskConsumed();
        setRequestTaskOpen(false);
        requestTaskMutation.reset();
        toast.success('Task Request가 생성되었습니다.');
      },
    });
  }

  function handleSimilarVocSelect(id: string): void {
    // Match VOC list-row selection: retain the current view and filters.
    void navigate({
      to: '/vocs',
      search: (prev: Record<string, unknown>) => ({ ...prev, selected: id }),
    });
  }

  function handleOpenTriage(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void navigate({
      to: '/vocs',
      // biome-ignore lint/suspicious/noExplicitAny: TanStack search updater is untyped at this call site (same idiom as TriageRoute.tsx:73)
      search: (prev: any) => ({ ...prev, view: 'triage', selected: vocId }) as any,
    });
  }

  function handleOpenTask(taskId: string): void {
    void navigate({ to: '/tasks', search: { param: taskId } });
  }

  return {
    setComposerDirty,
    dirtyConfirmOpen,
    createFindingOpen,
    setCreateFindingOpen,
    requestTaskOpen,
    setRequestTaskOpen,
    reviewOpen,
    setReviewOpen,
    scrollRef,
    actorNamesById,
    analyticsAreasById,
    canTriage,
    canSeeInternalOps,
    linkedTask,
    requestTaskIsPending: requestTaskMutation.isPending,
    pendingReviewCount,
    canCreateFinding,
    canRequestTask,
    showsSimilarVocSection,
    isReporterArm,
    handleClose,
    handleDirtyConfirm,
    handleDirtyCancel,
    closeRequestTaskDraft,
    handleRequestTaskSubmit,
    handleSimilarVocSelect,
    handleOpenTriage,
    handleOpenTask,
  };
}
