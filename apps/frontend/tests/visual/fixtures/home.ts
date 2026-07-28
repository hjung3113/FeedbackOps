import { dashboardSummarySchema, taskDtoSchema, taskRequestDtoSchema } from '@fops/shared';

export const homeSummaryFixture = dashboardSummarySchema.parse({
  kpis: { open_voc: 47, active_finding: 14, pending_request: 8, tasks_in_flight: 23, coverage_percent: 67 },
  action_queues: [
    { id: 'unassigned-voc', severity: 'urgent', count: 12, next_action: { label: 'Review VOCs', route: '/vocs?view=triage&tab=unassigned', intent: 'review' }, secondary_action: { label: 'Bulk assign', route: '/vocs?view=triage&tab=unassigned', intent: 'assign' } },
    { id: 'actionable-finding-no-execution', severity: 'warn', count: 8, next_action: { label: 'Request Tasks', route: '/findings', intent: 'request-task' }, secondary_action: { label: 'Open queue', route: '/findings', intent: 'open' } },
    { id: 'released-task-unresolved-voc', severity: 'warn', count: 5, next_action: { label: 'Review Updates', route: '/vocs?view=inbox', intent: 'review-update' }, secondary_action: { label: 'Open queue', route: '/vocs?view=inbox', intent: 'open' } },
    { id: 'bad-outcome-no-followup', severity: 'urgent', count: 3, next_action: { label: 'Create Follow-up', route: '/surveys', intent: 'create-follow-up' }, secondary_action: { label: 'View surveys', route: '/surveys', intent: 'open' } },
    { id: 'high-severity-unlinked', severity: 'urgent', count: 4, next_action: { label: 'Link Finding', route: '/vocs?view=triage&tab=high', intent: 'link' }, secondary_action: { label: 'Open queue', route: '/vocs?view=triage&tab=high', intent: 'open' } },
    { id: 'permission-requests-pending', severity: 'info', count: 2, next_action: { label: 'Open Requests', route: '/admin/permissions/requests', intent: 'review' }, secondary_action: null },
  ],
  coverage: [
    { id: 'voc-task', value: 180, total: 1000, percent: 18, status: 'warn' },
    { id: 'finding-execution', value: 23, total: 31, percent: 74, status: 'good' },
    { id: 'high-followup', value: 41, total: 47, percent: 87, status: 'good' },
  ],
});

export const homeVisualSnapshot = 'home-action-dashboard.png';
export const homeEmptyVisualSnapshot = 'home-action-dashboard-empty.png';

const homeFixtureIds = {
  taskOne: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  taskTwo: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  requestOne: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  requestTwo: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  finding: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  voc: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
} as const;

const taskBase = {
  workspace_id: '11111111-1111-4111-8111-111111111111',
  primary_managed_system_id: '33333333-3333-4333-8333-333333333333',
  assignee_actor_id: '22222222-2222-4222-8222-222222222222',
  due_date: null,
  milestone_id: null,
  analytics_area_id: null,
  source_task_request_id: null,
  created_by: '22222222-2222-4222-8222-222222222222',
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
} as const;

export const homeMyWorkTasksFixture = [
  taskDtoSchema.parse({ ...taskBase, id: homeFixtureIds.taskOne, display_id: 'TASK-901', title: '매출 리포트 쿼리 플랜 개선', status: 'review', priority: 'high' }),
  taskDtoSchema.parse({ ...taskBase, id: homeFixtureIds.taskTwo, display_id: 'TASK-902', title: '데이터 추출 안정화', status: 'doing', priority: 'medium' }),
];

const taskRequestBase = {
  workspace_id: taskBase.workspace_id,
  primary_managed_system_id: taskBase.primary_managed_system_id,
  evidence_summary: '후속 조치가 필요한 운영 신호입니다.',
  requester_actor_id: taskBase.created_by,
  status: 'pending_review',
  reviewer_actor_id: null,
  decision_reason: null,
  decided_at: null,
  created_at: taskBase.created_at,
  updated_at: taskBase.updated_at,
} as const;

export const homeMyWorkRequestsFixture = [
  taskRequestDtoSchema.parse({ ...taskRequestBase, id: homeFixtureIds.requestOne, display_id: 'REQ-42', source_type: 'finding', source_id: homeFixtureIds.finding, requested_outcome: '검토 결과 → Task 변환' }),
  taskRequestDtoSchema.parse({ ...taskRequestBase, id: homeFixtureIds.requestTwo, display_id: 'REQ-43', source_type: 'voc', source_id: homeFixtureIds.voc, requested_outcome: '공개 업데이트 검토' }),
];
