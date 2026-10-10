import { convertTaskRequest, fetchPermissionCheck } from '@/lib/api';
import { fetchAnalyticsAreas } from '@/lib/api/analytics-areas';
import { GENERIC_ERROR_MESSAGE, mapUnknownError } from '@/lib/api/errorMapper';
import { listMilestones } from '@/lib/api/milestones';
import { isPermissionDenied } from '@/lib/api/types';
import { zodIssueMessage } from '@/lib/forms/zodIssueMessage';
import { invalidateNavCounts } from '@/lib/query/navCounts';
import {
  type MilestoneDto,
  type TaskDto,
  type TaskPriority,
  type TaskRequestDto,
  convertTaskRequestRequestSchema,
  taskPrioritySchema,
} from '@fops/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { toast } from 'sonner';

import { TASK_TITLE_MAX_LENGTH, canConvertTaskRequest, defaultConvertTitle } from './predicates';

export interface UseTaskRequestConversionArgs {
  item: TaskRequestDto;
  currentRole: string | null;
  defaultAnalyticsAreaId?: string | null;
  defaultAnalyticsAreaResolved?: boolean;
}

export type AnalyticsAreaSelection =
  | { kind: 'active'; id: string }
  | { kind: 'none' }
  | {
      kind: 'unresolved';
      reason: 'source-unavailable' | 'selection-unavailable';
      unavailableId: string;
    };

export const TASK_PRIORITIES: readonly TaskPriority[] = taskPrioritySchema.options;

export interface UseTaskRequestConversionResult {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  title: string;
  setTitle: (value: string) => void;
  titleError: string | null;
  titleInputRef: React.RefObject<HTMLInputElement | null>;
  titleMaxLength: number;
  priority: TaskPriority;
  setPriority: (value: TaskPriority) => void;
  assigneeId: string;
  setAssigneeId: (value: string) => void;
  dueDate: string;
  setDueDate: (value: string) => void;
  milestoneId: string;
  setMilestoneId: (value: string) => void;
  /** Retained cache is suppressed on a settled read error (R2, Astra P2-3). */
  milestones: MilestoneDto[] | undefined;
  /** Settled picker read error, classified; null while the read stands. */
  milestonePickerError: { denied: boolean; message: string } | null;
  /** R4 — a held selection missing from a settled successful list. */
  milestoneSelectionUnavailable: boolean;
  analyticsAreaSelection: AnalyticsAreaSelection;
  analyticsAreaUnresolvedReason: 'source-unavailable' | 'selection-unavailable' | null;
  setAnalyticsAreaId: (value: string) => void;
  analyticsAreas: Array<{ id: string; name: string }> | undefined;
  isPending: boolean;
  /** Last conversion mutation's settled result, independent of toast state. */
  result: TaskDto | null;
  /** Last conversion mutation's settled error, independent of toast state. */
  error: Error | null;
  canConvert: boolean;
  canSubmit: boolean;
  submit: (event: React.FormEvent<HTMLFormElement>) => void;
}

export function useTaskRequestConversion({
  item,
  currentRole,
  defaultAnalyticsAreaId = null,
  defaultAnalyticsAreaResolved = true,
}: UseTaskRequestConversionArgs): UseTaskRequestConversionResult {
  const queryClient = useQueryClient();
  const itemRef = React.useRef(item);
  itemRef.current = item;
  const selectedRequestId = item.id;
  const lastResetRequestIdRef = React.useRef(selectedRequestId);
  const [convertOpen, setConvertOpen] = React.useState(false);
  const [convertTitle, setConvertTitle] = React.useState(() =>
    defaultConvertTitle(item.requested_outcome),
  );
  const [convertTitleError, setConvertTitleError] = React.useState<string | null>(null);
  const convertTitleInputRef = React.useRef<HTMLInputElement>(null);
  const [convertPriority, setConvertPriority] = React.useState<TaskPriority>('medium');
  const [convertAssigneeId, setConvertAssigneeId] = React.useState('');
  const [convertDueDate, setConvertDueDate] = React.useState('');
  const [convertMilestoneId, setConvertMilestoneId] = React.useState('');
  const [convertAnalyticsAreaSelection, setConvertAnalyticsAreaSelection] =
    React.useState<AnalyticsAreaSelection>({ kind: 'none' });
  const [analyticsAreaChoiceInitialized, setAnalyticsAreaChoiceInitialized] = React.useState(false);
  const analyticsAreaEdited = React.useRef(false);

  React.useEffect(() => {
    if (lastResetRequestIdRef.current === selectedRequestId) return;
    lastResetRequestIdRef.current = selectedRequestId;
    const selectedItem = itemRef.current;
    setConvertTitle(defaultConvertTitle(selectedItem.requested_outcome));
    setConvertTitleError(null);
    setConvertPriority('medium');
    setConvertAssigneeId('');
    setConvertDueDate('');
    setConvertMilestoneId('');
    setConvertAnalyticsAreaSelection({ kind: 'none' });
    setAnalyticsAreaChoiceInitialized(false);
    analyticsAreaEdited.current = false;
    setConvertOpen(false);
  }, [selectedRequestId]);

  const manageCheck = useQuery({
    queryKey: ['permission-check', 'finding.manage', item.primary_managed_system_id],
    queryFn: ({ signal }) =>
      fetchPermissionCheck('finding.manage', {
        managedSystemId: item.primary_managed_system_id,
        signal,
      }),
    enabled: currentRole !== 'admin',
    staleTime: 60 * 1000,
  });
  const canManage = currentRole === 'admin' || manageCheck.data?.state === 'approved';

  const analyticsAreasQuery = useQuery({
    queryKey: ['analytics-areas', item.primary_managed_system_id] as const,
    queryFn: ({ signal }) =>
      fetchAnalyticsAreas({
        managedSystemId: item.primary_managed_system_id,
        includeArchived: false,
        signal,
      }),
    enabled: convertOpen,
    staleTime: 10 * 60 * 1000,
  });
  const activeAnalyticsAreaOptions = React.useMemo(
    () => analyticsAreasQuery.data?.items.filter((area) => area.archived_at === null),
    [analyticsAreasQuery.data?.items],
  );
  const analyticsAreaOptionsResolved = analyticsAreasQuery.isSuccess || analyticsAreasQuery.isError;
  const inheritedAnalyticsAreaIsActive =
    defaultAnalyticsAreaId !== null &&
    analyticsAreasQuery.isSuccess &&
    (activeAnalyticsAreaOptions?.some((area) => area.id === defaultAnalyticsAreaId) ?? false);

  React.useEffect(() => {
    if (
      itemRef.current.id !== selectedRequestId ||
      analyticsAreaEdited.current ||
      !analyticsAreaOptionsResolved ||
      !defaultAnalyticsAreaResolved
    ) {
      return;
    }
    setConvertAnalyticsAreaSelection(
      defaultAnalyticsAreaId === null
        ? { kind: 'none' }
        : inheritedAnalyticsAreaIsActive
          ? { kind: 'active', id: defaultAnalyticsAreaId }
          : {
              kind: 'unresolved',
              reason: 'source-unavailable',
              unavailableId: defaultAnalyticsAreaId,
            },
    );
    setAnalyticsAreaChoiceInitialized(true);
  }, [
    analyticsAreaOptionsResolved,
    defaultAnalyticsAreaId,
    defaultAnalyticsAreaResolved,
    inheritedAnalyticsAreaIsActive,
    selectedRequestId,
  ]);
  const selectedAnalyticsAreaUnavailable =
    convertAnalyticsAreaSelection.kind === 'active' &&
    (analyticsAreasQuery.isError ||
      (analyticsAreasQuery.isSuccess &&
        !(
          activeAnalyticsAreaOptions?.some(
            (area) => area.id === convertAnalyticsAreaSelection.id,
          ) ?? false
        )));
  const analyticsAreaSelection: AnalyticsAreaSelection = selectedAnalyticsAreaUnavailable
    ? {
        kind: 'unresolved',
        reason: 'selection-unavailable',
        unavailableId:
          convertAnalyticsAreaSelection.kind === 'active' ? convertAnalyticsAreaSelection.id : '',
      }
    : convertAnalyticsAreaSelection;
  const analyticsAreaUnresolvedReason =
    analyticsAreaSelection.kind === 'unresolved' ? analyticsAreaSelection.reason : null;

  React.useEffect(() => {
    if (!selectedAnalyticsAreaUnavailable || convertAnalyticsAreaSelection.kind !== 'active') {
      return;
    }
    setConvertAnalyticsAreaSelection({
      kind: 'unresolved',
      reason: 'selection-unavailable',
      unavailableId: convertAnalyticsAreaSelection.id,
    });
  }, [convertAnalyticsAreaSelection, selectedAnalyticsAreaUnavailable]);

  const milestonesQuery = useQuery({
    queryKey: ['milestones', item.primary_managed_system_id] as const,
    queryFn: ({ signal }) =>
      listMilestones({
        managed_system_id: item.primary_managed_system_id,
        signal,
      }),
    enabled: convertOpen,
    staleTime: 10 * 60 * 1000,
  });

  // R2 (Astra P2-3) — a settled picker read error wins over the data React
  // Query retains (same terminal-error contract as the milestone detail
  // panel, R2-1): retained titles must not render as options, a denial is
  // distinguishable from an empty list, and a selection made from the
  // retained cache cannot be submitted.
  const milestonesError = milestonesQuery.error;
  const milestonePickerDenied = isPermissionDenied(milestonesError);
  const milestonePickerError =
    milestonesError === null
      ? null
      : { denied: milestonePickerDenied, message: mapUnknownError(milestonesError).message };

  // R4 (Astra P2-2) — the list can also drop the held row inside a 200
  // response (the list filters rows the actor can no longer see). A held id
  // absent from a settled successful list is unavailable exactly like the
  // error case; it is never silently cleared.
  const milestoneSelectionUnavailable =
    milestonesError === null &&
    milestonesQuery.data != null &&
    convertMilestoneId !== '' &&
    !milestonesQuery.data.items.some((milestone) => milestone.id === convertMilestoneId);

  const convertMutation = useMutation<TaskDto, Error, void>({
    mutationFn: async () => {
      const title = convertTitle.trim();
      return convertTaskRequest(
        item.id,
        {
          title,
          priority: convertPriority,
          assignee_actor_id: convertAssigneeId.trim() || null,
          due_date: convertDueDate.trim() || null,
          milestone_id: convertMilestoneId || null,
          analytics_area_id:
            convertAnalyticsAreaSelection.kind === 'active' && !selectedAnalyticsAreaUnavailable
              ? convertAnalyticsAreaSelection.id
              : null,
        },
        crypto.randomUUID(),
      );
    },
    onSuccess: (task) => {
      invalidateNavCounts(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['task-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['task-request'] });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success(`Task ${task.display_id}로 전환했습니다.`);
      setConvertOpen(false);
    },
    onError: (err) => {
      toast.error(mapUnknownError(err).message);
    },
  });

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    // R2 + R4 — a selection made from retained cache cannot ride once its
    // read has failed terminally, and a held id omitted from a successful
    // refreshed list is equally unavailable; only an explicit None ('') is
    // allowed through.
    if ((milestonesError !== null || milestoneSelectionUnavailable) && convertMilestoneId !== '') {
      return;
    }
    if (analyticsAreaSelection.kind === 'unresolved' || selectedAnalyticsAreaUnavailable) return;
    const titleResult = convertTaskRequestRequestSchema.shape.title.safeParse(convertTitle);
    if (!titleResult.success) {
      const issue = titleResult.error.issues[0];
      setConvertTitleError(issue ? zodIssueMessage(issue) : GENERIC_ERROR_MESSAGE);
      convertTitleInputRef.current?.focus();
      return;
    }
    setConvertTitleError(null);
    convertMutation.mutate();
  }

  return {
    open: convertOpen,
    setOpen: setConvertOpen,
    title: convertTitle,
    setTitle: (value) => {
      setConvertTitle(value);
      setConvertTitleError(null);
    },
    titleError: convertTitleError,
    titleInputRef: convertTitleInputRef,
    titleMaxLength: TASK_TITLE_MAX_LENGTH,
    priority: convertPriority,
    setPriority: setConvertPriority,
    assigneeId: convertAssigneeId,
    setAssigneeId: setConvertAssigneeId,
    dueDate: convertDueDate,
    setDueDate: setConvertDueDate,
    milestoneId: convertMilestoneId,
    setMilestoneId: setConvertMilestoneId,
    milestones: milestonesError === null ? milestonesQuery.data?.items : undefined,
    milestonePickerError,
    milestoneSelectionUnavailable,
    analyticsAreaSelection,
    analyticsAreaUnresolvedReason,
    setAnalyticsAreaId: (value) => {
      analyticsAreaEdited.current = true;
      setAnalyticsAreaChoiceInitialized(true);
      setConvertAnalyticsAreaSelection(
        value === '' ? { kind: 'none' } : { kind: 'active', id: value },
      );
    },
    analyticsAreas: analyticsAreasQuery.isError
      ? undefined
      : activeAnalyticsAreaOptions?.map(({ id, name }) => ({ id, name })),
    isPending: convertMutation.isPending,
    result: convertMutation.data ?? null,
    error: convertMutation.error ?? null,
    canConvert: canConvertTaskRequest(item.status) && canManage,
    canSubmit:
      canConvertTaskRequest(item.status) &&
      canManage &&
      analyticsAreaChoiceInitialized &&
      analyticsAreaSelection.kind !== 'unresolved' &&
      !selectedAnalyticsAreaUnavailable,
    submit,
  };
}
