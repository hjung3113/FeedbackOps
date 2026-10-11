import type { ListTaskRequestsQuery, TaskRequestDto } from '@fops/shared';

export function taskRequestPage<T extends Pick<TaskRequestDto, 'status'>>(
  items: T[],
  options: Pick<ListTaskRequestsQuery, 'limit' | 'status'> = {},
) {
  const counts = {
    pending_review: 0,
    approved: 0,
    rejected: 0,
    needs_more_evidence: 0,
    converted: 0,
  };
  for (const item of items) counts[item.status] += 1;
  const shown =
    options.status === undefined ? items : items.filter((item) => item.status === options.status);
  return {
    items: shown,
    page: {
      total: shown.length,
      has_more: false,
      ...(options.status === undefined ? { status_counts: counts } : {}),
    },
  };
}
