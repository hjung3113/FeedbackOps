import { convertTaskRequest, fetchPermissionCheck } from '@/lib/api';
import { fetchAnalyticsAreas } from '@/lib/api/analytics-areas';
import {
  type TaskDto,
  type TaskPriority,
  type TaskRequestDto,
  convertTaskRequestRequestSchema,
} from '@fops/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { toast } from 'sonner';

import { TASK_TITLE_MAX_LENGTH, canConvertTaskRequest, defaultConvertTitle } from './predicates';

export interface UseTaskRequestConversionArgs {
  item: TaskRequestDto;
  currentRole: string | null;
}

export const TASK_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

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
  analyticsAreaId: string;
  setAnalyticsAreaId: (value: string) => void;
  analyticsAreas: Array<{ id: string; name: string }> | undefined;
  isPending: boolean;
  /** Last conversion mutation's settled result, independent of toast state. */
  result: TaskDto | null;
  /** Last conversion mutation's settled error, independent of toast state. */
  error: Error | null;
  canConvert: boolean;
  submit: (event: React.FormEvent<HTMLFormElement>) => void;
}

export function useTaskRequestConversion({
  item,
  currentRole,
}: UseTaskRequestConversionArgs): UseTaskRequestConversionResult {
  const queryClient = useQueryClient();
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
  const [convertAnalyticsAreaId, setConvertAnalyticsAreaId] = React.useState('');

  React.useEffect(() => {
    setConvertTitle(defaultConvertTitle(item.requested_outcome));
    setConvertTitleError(null);
    setConvertPriority('medium');
    setConvertAssigneeId('');
    setConvertDueDate('');
    setConvertMilestoneId('');
    setConvertAnalyticsAreaId('');
    setConvertOpen(false);
  }, [item]);

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
          milestone_id: null,
          analytics_area_id: convertAnalyticsAreaId.trim() || null,
        },
        crypto.randomUUID(),
      );
    },
    onSuccess: (task) => {
      void queryClient.invalidateQueries({ queryKey: ['task-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast(`Converted to Task ${task.display_id}.`);
      setConvertOpen(false);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const titleResult = convertTaskRequestRequestSchema.shape.title.safeParse(convertTitle);
    if (!titleResult.success) {
      setConvertTitleError(titleResult.error.issues[0]?.message ?? 'Title is invalid.');
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
    analyticsAreaId: convertAnalyticsAreaId,
    setAnalyticsAreaId: setConvertAnalyticsAreaId,
    analyticsAreas: analyticsAreasQuery.data?.items,
    isPending: convertMutation.isPending,
    result: convertMutation.data ?? null,
    error: convertMutation.error ?? null,
    canConvert: canConvertTaskRequest(item.status) && canManage,
    submit,
  };
}
