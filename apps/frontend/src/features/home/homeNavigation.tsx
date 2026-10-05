import type { DashboardSummary } from '@fops/shared';
import { Command as CommandIcon, Home } from 'lucide-react';

import { COMMAND_PALETTE_COPY } from '@/lib/copy/command-palette';
import { HOME_QUEUE_COPY } from '@/lib/copy/home';
import type { SidebarNavItem } from '@/lib/layout/AppSidebar';
import { shortcutLabel } from '@/lib/layout/command-palette/platform';

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
  onOpenCommandPalette?: () => void,
): SidebarNavItem[] {
  const queues = summary?.action_queues.map((queue) => ({
    id: `queue-${queue.id}`,
    label: HOME_QUEUE_COPY[queue.id].sidebarLabel,
    href: queue.next_action.route,
    section: '액션 큐',
    countKey: QUEUE_COUNT_KEY[queue.id],
    count: queue.count,
    urgent: queue.severity === 'urgent',
  })) ?? [];
  // #611 exposes the action only in frames that can open the mounted palette.
  const commandRow: SidebarNavItem[] =
    onOpenCommandPalette === undefined
      ? []
      : [
          {
            id: 'command',
            label: COMMAND_PALETTE_COPY.rowLabel,
            section: 'FEEDBACKOPS',
            icon: <CommandIcon className="h-4 w-4" />,
            trailing: (
              <span className="rounded-sm border border-border-subtle bg-surface-row-hover px-1.25 py-px font-mono text-caption leading-body text-text-muted">
                {shortcutLabel()}
              </span>
            ),
            onSelect: onOpenCommandPalette,
          },
        ];

  return [
    { id: 'home', label: '홈', href: '/home', section: 'FEEDBACKOPS', icon: <Home className="h-4 w-4" />, active },
    ...commandRow,
    ...queues,
  ];
}
