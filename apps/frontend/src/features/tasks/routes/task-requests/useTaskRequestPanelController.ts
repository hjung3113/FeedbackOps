import { useFindingDetail } from '@/features/findings/hooks/useFindingDetail';
import type { TaskDto, TaskRequestDto } from '@fops/shared';

import { useTaskRequestConversion } from './useTaskRequestConversion';
import { useTaskRequestConvertedTaskLink } from './useTaskRequestConvertedTaskLink';
import { useTaskRequestLink } from './useTaskRequestLink';

export function useTaskRequestPanelController({
  item,
  currentRole,
}: {
  item: TaskRequestDto;
  currentRole: string | null;
}) {
  const sourceFindingQuery = useFindingDetail(
    item.source_type === 'finding' ? item.source_id : null,
  );
  const sourceAnalyticsAreaId =
    sourceFindingQuery.data?.id === item.source_id
      ? sourceFindingQuery.data.analytics_area_id
      : null;
  const conversion = useTaskRequestConversion({
    item,
    currentRole,
    defaultAnalyticsAreaId: sourceAnalyticsAreaId,
    defaultAnalyticsAreaResolved:
      item.source_type !== 'finding' ||
      (sourceFindingQuery.isSuccess && sourceFindingQuery.data?.id === item.source_id) ||
      sourceFindingQuery.isError,
  });
  const link = useTaskRequestLink({ item, currentRole });
  const resultingTask: TaskDto | null =
    conversion.result?.source_task_request_id === item.id
      ? conversion.result
      : link.resultTaskRequestId === item.id
        ? link.result
        : null;
  const convertedTaskLink = useTaskRequestConvertedTaskLink(item.id, item.status === 'converted');
  // Once the canonical read has answered (null included), a later refetch error must not bring
  // back the immediate mutation result.
  const taskForOutcome =
    convertedTaskLink.data !== undefined ? convertedTaskLink.data : resultingTask;

  return { sourceFindingQuery, conversion, link, resultingTask, taskForOutcome };
}
