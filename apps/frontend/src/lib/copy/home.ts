import type { DashboardSummary } from '@fops/shared';

export const HOME_COPY = {
  title: (name: string) => `안녕하세요, ${name}님`,
  subtitle: (queues: DashboardSummary['action_queues'] | undefined) => {
    if (queues === undefined) return '오늘 워크스페이스의 운영 현황을 불러오는 중입니다.';
    if (queues.length === 0) return '현재 확인할 운영 큐가 없습니다.';
    const count = queues.reduce((total, queue) => total + queue.count, 0);
    return `오늘 워크스페이스에 ${count}개의 운영 갭이 있습니다. 우선순위가 높은 큐부터 확인하세요.`;
  },
  queueHeading: 'Recovery & follow-up queues', myWork: 'My work', coverage: 'Coverage signals',
  openRequests: 'Open requests', noOpenRequests: 'No open requests.',
  refresh: 'Refresh queues', newVoc: 'New VOC', openMyWork: 'Open My Work', viewCoverage: 'View coverage',
} as const;

export const HOME_KPI_COPY = { open_voc: 'Open VOC', active_finding: 'Active Finding', pending_request: 'Pending Request', tasks_in_flight: 'Tasks In Flight', coverage_percent: 'Coverage' } as const;

export const HOME_QUEUE_COPY: Record<DashboardSummary['action_queues'][number]['id'], { title: string; sidebarLabel: string; detail: string; primaryAction: string; secondaryAction?: string }> = {
  'unassigned-voc': { title: 'Unassigned VOC', sidebarLabel: 'Unassigned VOC', detail: '담당자가 지정되지 않은 VOC가 누적되어 있습니다. 우선 분류와 담당 배정이 필요합니다.', primaryAction: 'Review VOCs', secondaryAction: 'Bulk assign' },
  'high-severity-unlinked': { title: 'High Severity VOC unlinked', sidebarLabel: 'High-severity links', detail: 'High/Critical severity의 VOC 중 Finding 연결이 없는 항목입니다.', primaryAction: 'Link Finding', secondaryAction: 'Open queue' },
  'actionable-finding-no-execution': { title: 'Actionable Finding without execution', sidebarLabel: 'Configured follow-up', detail: 'Active 상태의 Finding 중 Task Request 또는 Task 링크가 없는 항목입니다.', primaryAction: 'Request Tasks', secondaryAction: 'Open queue' },
  'released-task-unresolved-voc': { title: 'Released Task with unresolved VOC', sidebarLabel: 'Public update review', detail: 'Task는 Released지만 연결된 Reporter-facing VOC Status가 해결됨이 아닙니다.', primaryAction: 'Review Updates', secondaryAction: 'Open queue' },
  'bad-outcome-no-followup': { title: 'Bad Outcome Survey without follow-up', sidebarLabel: 'Outcome follow-up', detail: 'Negative outcome survey 결과에 대한 후속 Finding/Task가 구성되어 있지 않습니다.', primaryAction: 'Create Follow-up', secondaryAction: 'View surveys' },
  'permission-requests-pending': { title: 'Permission requests awaiting review', sidebarLabel: 'Permission review', detail: 'Workspace Admin 검토를 기다리는 elevated/scope 권한 요청입니다.', primaryAction: 'Open Requests' },
};

export const HOME_COVERAGE_COPY: Record<DashboardSummary['coverage'][number]['id'], string> = {
  'voc-task': 'VOC linked to Task', 'finding-execution': 'Active Finding with execution', 'milestone-outcome': 'Milestone with outcome survey', 'high-followup': 'High severity VOC follow-up SLA', 'released-update': 'Released Task reporter update', 'analytics-area': 'Analytics area coverage',
};

export function homeSeverityLabel(severity: DashboardSummary['action_queues'][number]['severity']): string {
  return severity === 'urgent' ? 'Recovery' : severity === 'warn' ? 'Follow-up' : 'Review';
}
