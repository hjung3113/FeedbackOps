import type { DashboardSummary } from '@fops/shared';
import { Home } from 'lucide-react';

import { HOME_QUEUE_COPY } from '@/lib/copy/home';
import type { SidebarNavEntry } from '@/lib/layout/AppSidebar';

const QUEUE_COUNT_KEY = {
  'unassigned-voc': 'home.unassigned-voc',
  'high-severity-unlinked': 'home.high-severity-unlinked',
  'actionable-finding-no-execution': 'home.actionable-finding-no-execution',
  'released-task-unresolved-voc': 'home.released-task-unresolved-voc',
  'bad-outcome-no-followup': 'home.bad-outcome-no-followup',
  'permission-requests-pending': 'home.permission-requests-pending',
} as const;

export function homeSidebarEntries(
  summary: DashboardSummary | undefined,
  active: boolean,
): SidebarNavEntry[] {
  const queues = summary?.action_queues.map((queue) => ({
    id: `queue-${queue.id}`,
    label: HOME_QUEUE_COPY[queue.id].sidebarLabel,
    href: queue.next_action.route,
    section: 'ACTION QUEUES',
    countKey: QUEUE_COUNT_KEY[queue.id],
    count: queue.count,
    urgent: queue.severity === 'urgent',
  })) ?? [];
  // #585: Show actor-safe backend queues only; prototype Command/RECENT items are placeholders.
  return [
    { id: 'home', label: 'Home', href: '/home', section: 'FEEDBACKOPS', icon: <Home className="h-4 w-4" />, active },
    ...queues,
  ];
}
