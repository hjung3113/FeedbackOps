import { dashboardSummarySchema } from '@fops/shared';

export const COVERAGE_IDS = {
  workspace: '11111111-1111-4111-8111-111111111111',
  systemA: 'a1111111-1111-4111-8111-111111111111',
  systemB: 'b2222222-2222-4222-8222-222222222222',
  areaA: 'c3333333-3333-4333-8333-333333333333',
} as const;

// The baseline must show absence versus a permitted zero: system A carries an
// explicit zero (finding-execution 0/4, unassigned-voc 0), system B omits the
// finding keys entirely (em dashes), and the area row omits high-severity.
export const coverageSummaryFixture = dashboardSummarySchema.parse({
  kpis: {
    open_voc: 47,
    active_finding: 14,
    pending_request: 8,
    tasks_in_flight: 23,
    coverage_percent: 18,
  },
  action_queues: [
    {
      id: 'unassigned-voc',
      severity: 'urgent',
      count: 12,
      next_action: {
        label: 'Review VOCs',
        route: '/vocs?view=inbox&tab=unassigned',
        intent: 'review',
      },
      secondary_action: {
        label: 'Bulk assign',
        route: '/vocs?view=inbox&tab=unassigned',
        intent: 'assign',
      },
    },
    {
      id: 'high-severity-unlinked',
      severity: 'urgent',
      count: 4,
      next_action: {
        label: 'Review high severity VOCs',
        route: '/vocs?view=inbox&tab=high-no-link',
        intent: 'review',
      },
      secondary_action: null,
    },
    {
      id: 'actionable-finding-no-execution',
      severity: 'warn',
      count: 8,
      next_action: {
        label: 'Request Tasks',
        route: '/findings?execution=none',
        intent: 'request-task',
      },
      secondary_action: null,
    },
    {
      id: 'released-task-unresolved-voc',
      severity: 'warn',
      count: 5,
      next_action: { label: 'Review Updates', route: '/tasks?view=board', intent: 'review-update' },
      secondary_action: null,
    },
    {
      id: 'bad-outcome-no-followup',
      severity: 'urgent',
      count: 3,
      next_action: { label: 'Create Follow-up', route: '/surveys', intent: 'create-follow-up' },
      secondary_action: null,
    },
    {
      id: 'permission-requests-pending',
      severity: 'info',
      count: 2,
      next_action: {
        label: 'Open Requests',
        route: '/admin/permissions/requests',
        intent: 'review',
      },
      secondary_action: null,
    },
  ],
  coverage: [
    { id: 'voc-task', value: 180, total: 1000, percent: 18, status: 'warn' },
    { id: 'finding-execution', value: 23, total: 31, percent: 74, status: 'good' },
    { id: 'high-followup', value: 41, total: 47, percent: 87, status: 'good' },
    { id: 'released-update', value: 12, total: 17, percent: 70, status: 'warn' },
    { id: 'analytics-area', value: 412, total: 612, percent: 67, status: 'warn' },
  ],
  by_managed_system: [
    {
      managed_system_id: COVERAGE_IDS.systemA,
      coverage: {
        'voc-task': { value: 180, total: 1000, percent: 18, status: 'warn' },
        'finding-execution': { value: 0, total: 4, percent: 0, status: 'bad' },
        'high-followup': { value: 41, total: 47, percent: 87, status: 'good' },
        'released-update': { value: 12, total: 17, percent: 70, status: 'warn' },
        'analytics-area': { value: 412, total: 612, percent: 67, status: 'warn' },
      },
      action_queues: {
        'unassigned-voc': 0,
        'high-severity-unlinked': 4,
        'actionable-finding-no-execution': 8,
        'released-task-unresolved-voc': 5,
        'bad-outcome-no-followup': 3,
      },
      analytics_areas: [
        {
          analytics_area_id: COVERAGE_IDS.areaA,
          coverage: {
            'voc-task': { value: 20, total: 100, percent: 20, status: 'warn' },
            'high-followup': { value: 6, total: 7, percent: 86, status: 'good' },
          },
          action_queues: { 'unassigned-voc': 1 },
        },
      ],
    },
    {
      managed_system_id: COVERAGE_IDS.systemB,
      coverage: {
        'voc-task': { value: 2, total: 8, percent: 25, status: 'bad' },
      },
      action_queues: {
        'bad-outcome-no-followup': 0,
      },
    },
  ],
});

export const coverageManagedSystemsFixture = {
  items: [
    {
      id: COVERAGE_IDS.systemA,
      workspace_id: COVERAGE_IDS.workspace,
      slug: 'identity',
      name: 'Identity Platform',
      external_key: null,
      default_owner_actor_id: null,
      default_owner_team_id: null,
      archived_at: null,
      archived_by_actor_id: null,
      created_at: '2026-07-10T00:00:00.000Z',
      updated_at: '2026-07-10T00:00:00.000Z',
    },
    {
      id: COVERAGE_IDS.systemB,
      workspace_id: COVERAGE_IDS.workspace,
      slug: 'warehouse',
      name: 'Data Warehouse',
      external_key: null,
      default_owner_actor_id: null,
      default_owner_team_id: null,
      archived_at: null,
      archived_by_actor_id: null,
      created_at: '2026-07-10T00:00:00.000Z',
      updated_at: '2026-07-10T00:00:00.000Z',
    },
  ],
  total: 2,
} as const;

export const coverageAnalyticsAreasFixture = {
  items: [
    {
      id: COVERAGE_IDS.areaA,
      workspace_id: COVERAGE_IDS.workspace,
      managed_system_id: COVERAGE_IDS.systemA,
      slug: 'growth',
      name: '성장 지표',
      owner_team_id: null,
      archived_at: null,
      archived_by_actor_id: null,
      created_at: '2026-07-10T00:00:00.000Z',
      updated_at: '2026-07-10T00:00:00.000Z',
    },
  ],
  total: 1,
} as const;

export const coverageVisualSnapshot = 'integration-coverage.png';
