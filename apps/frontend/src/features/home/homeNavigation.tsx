import type { DashboardSummary } from '@fops/shared';
import { Command, FileBarChart, Home, Inbox, ListTodo } from 'lucide-react';

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
  return [
    { id: 'home', label: 'Home', href: '/home', section: 'FEEDBACKOPS', icon: <Home className="h-4 w-4" />, active },
    { id: 'my-work', label: 'My Work', href: '/home', icon: <Inbox className="h-4 w-4" />, disabled: true },
    { id: 'command', label: 'Command', href: '/home', icon: <Command className="h-4 w-4" />, disabled: true, trailing: <kbd className="rounded border border-border-subtle px-1 text-[10px] text-text-muted">⌘K</kbd> },
    ...queues,
    { id: 'recent-finding', label: 'FIN-181 SSO 재인증', href: '/findings', section: 'RECENT', icon: <FileBarChart className="h-4 w-4" /> },
    { id: 'recent-voc', label: 'VOC-2814 사이드 메뉴', href: '/vocs?view=inbox', icon: <Inbox className="h-4 w-4" /> },
    { id: 'recent-task', label: 'TASK-901 쿼리 플랜', href: '/tasks?view=board', icon: <ListTodo className="h-4 w-4" /> },
  ];
}
