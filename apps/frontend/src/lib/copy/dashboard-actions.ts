// #679 — Korean display labels for backend-provided dashboard action labels.
// The backend does not translate (ADR-0010). These fixed system actions are chrome,
// so the frontend maps the stable `intent` key to Korean display copy; the API
// payload keeps its server label unchanged. Unknown intents keep the server label.

import type { DashboardSummary } from '@fops/shared';

type QueueId = DashboardSummary['action_queues'][number]['id'];

export const DASHBOARD_QUEUE_ACTION_LABELS: Record<QueueId, string> = {
  'unassigned-voc': 'VOC 검토',
  'high-severity-unlinked': '높은 심각도 VOC 검토',
  'actionable-finding-no-execution': 'Finding 검토',
  'released-task-unresolved-voc': 'Released Task 검토',
  'bad-outcome-no-followup': '성과 Survey 검토',
  'permission-requests-pending': '권한 요청 열기',
};

export const DASHBOARD_ACTION_LABELS: Record<string, string> = {
  triage: 'VOC 검토',
  bulk_assign: '일괄 담당자 지정',
  plan_execution: 'Finding 검토',
  request_reporter_update: 'Released Task 검토',
  create_followup: '성과 Survey 검토',
  review_permissions: '권한 요청 열기',
};

export function dashboardActionLabel(intent: string, serverLabel: string): string {
  return Object.hasOwn(DASHBOARD_ACTION_LABELS, intent)
    ? (DASHBOARD_ACTION_LABELS[intent] ?? serverLabel)
    : serverLabel;
}
