import { listTasks } from '@/lib/api/tasks';
import type { TaskDto } from '@fops/shared';
import { useQuery } from '@tanstack/react-query';

export function useMilestoneChildTasks(milestoneId: string): {
  childTasks: TaskDto[] | undefined;
  error: Error | null;
} {
  const query = useQuery({
    queryKey: ['tasks', { milestone_id: milestoneId }] as const,
    queryFn: ({ signal }) => listTasks({ milestone_id: milestoneId, signal }),
    staleTime: 30 * 1000,
  });

  // A settled error suppresses retained rows so navigation counts and the section share one barrier.
  return {
    childTasks: query.error == null ? query.data?.items : undefined,
    error: query.error,
  };
}
