import type { RecoveryCategory } from '@fops/shared';
import type { QueryClient } from '@tanstack/react-query';

export const RECOVERY_QUERY_KEY = ['recovery'] as const;
/** Prefix invalidation includes inactive pages and every Actor/presentation variant. */
export function invalidateRecovery(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: RECOVERY_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }),
  ]);
}

/** Presentation changes refresh the owning source's existing cache, without domain imports. */
export function invalidateRecoverySource(queryClient: QueryClient, category: RecoveryCategory) {
  const prefixes: Record<RecoveryCategory, readonly string[]> = {
    'unassigned-voc': ['voc', 'vocs'],
    'high-severity-unlinked': ['voc', 'vocs'],
    'actionable-finding-no-execution': ['finding', 'findings'],
    'released-task-unresolved-voc': ['task', 'tasks', 'voc', 'vocs'],
    'permission-requests-pending': ['permission-requests'],
    'bad-outcome-no-followup': ['surveys'],
  };
  return Promise.all(
    prefixes[category].map((prefix) => queryClient.invalidateQueries({ queryKey: [prefix] })),
  );
}
