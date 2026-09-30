import { ApiParseError } from '@/lib/api';
import { fetchTaskRequestEntityLinks } from '@/lib/api/entity-links';
import type { EntityLinkTargetSummary, ListEntityLinksResponse } from '@fops/shared';
import { useQuery } from '@tanstack/react-query';

export type ConvertedTaskSummary = Extract<EntityLinkTargetSummary, { type: 'task' }>;

// The resulting Task of a converted request comes from its canonical
// (task_request, task, converted_to) entity link, authorized per row (#653).
export function useTaskRequestConvertedTaskLink(taskRequestId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['entity-links', 'task-request', taskRequestId, 'converted_to'] as const,
    queryFn: ({ signal }) => fetchTaskRequestEntityLinks(taskRequestId, { signal }),
    select: (response) => convertedTaskSummaryFromEntityLinks(taskRequestId, response),
    enabled,
    staleTime: 30_000,
    retry: (failureCount, error) => !(error instanceof ApiParseError) && failureCount < 1,
  });
}

export function convertedTaskSummaryFromEntityLinks(
  taskRequestId: string,
  response: ListEntityLinksResponse,
): ConvertedTaskSummary | null {
  const link = response.items.find(
    (item) =>
      item.visibility_state === 'allowed' &&
      item.status === 'active' &&
      item.source_type === 'task_request' &&
      item.source_id === taskRequestId &&
      item.target_type === 'task' &&
      item.relation_type === 'converted_to',
  );
  if (
    link?.visibility_state !== 'allowed' ||
    link.target_summary?.type !== 'task' ||
    link.target_summary.id !== link.target_id
  ) {
    return null;
  }
  return link.target_summary;
}
