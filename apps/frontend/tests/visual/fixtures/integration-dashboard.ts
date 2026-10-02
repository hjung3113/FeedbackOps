import { dashboardSummarySchema } from '@fops/shared';

export const INTEGRATION_DASHBOARD_IDS = {
  workspace: '11111111-1111-4111-8111-111111111111',
  tableau: 'a1111111-1111-4111-8111-111111111111',
  powerBi: 'b2222222-2222-4222-8222-222222222222',
  looker: 'c3333333-3333-4333-8333-333333333333',
  metabase: 'd4444444-4444-4444-8444-444444444444',
  vocA: 'e5555555-5555-4555-8555-555555555555',
  vocB: 'f6666666-6666-4666-8666-666666666666',
  finding: 'a7777777-7777-4777-8777-777777777777',
  task: 'b8888888-8888-4888-8888-888888888888',
  survey: 'c9999999-9999-4999-8999-999999999999',
  permissionRequest: 'd0000000-0000-4000-8000-000000000000',
} as const;

const systemRows = [
  {
    managed_system_id: INTEGRATION_DASHBOARD_IDS.tableau,
    openVoc: 18,
    activeFinding: 11,
    tasksInFlight: 14,
    coveragePercent: 72,
    unassigned: 5,
  },
  {
    managed_system_id: INTEGRATION_DASHBOARD_IDS.powerBi,
    openVoc: 14,
    activeFinding: 8,
    tasksInFlight: 9,
    coveragePercent: 64,
    unassigned: 3,
  },
  {
    managed_system_id: INTEGRATION_DASHBOARD_IDS.looker,
    openVoc: 8,
    activeFinding: 6,
    tasksInFlight: 5,
    coveragePercent: 49,
    unassigned: 2,
  },
  {
    managed_system_id: INTEGRATION_DASHBOARD_IDS.metabase,
    openVoc: 7,
    activeFinding: 6,
    tasksInFlight: 3,
    coveragePercent: 38,
    unassigned: 2,
  },
] as const;

export const integrationDashboardSummaryFixture = dashboardSummarySchema.parse({
  kpis: {
    open_voc: 47,
    active_finding: 14,
    pending_request: 8,
    tasks_in_flight: 23,
    coverage_percent: 57,
  },
  action_queues: [
    {
      id: 'unassigned-voc',
      severity: 'urgent',
      count: 12,
      next_action: {
        label: 'Review VOCs',
        route: '/vocs?view=inbox&tab=unassigned',
        intent: 'triage',
      },
      secondary_action: {
        label: 'Bulk assign',
        route: '/vocs?view=inbox&tab=unassigned',
        intent: 'bulk_assign',
      },
    },
    {
      id: 'actionable-finding-no-execution',
      severity: 'warn',
      count: 8,
      next_action: { label: 'Review Findings', route: '/findings', intent: 'plan_execution' },
      secondary_action: null,
    },
    {
      id: 'released-task-unresolved-voc',
      severity: 'warn',
      count: 5,
      next_action: {
        label: 'Review released Tasks',
        route: '/tasks?view=board',
        intent: 'request_reporter_update',
      },
      secondary_action: null,
    },
    {
      id: 'bad-outcome-no-followup',
      severity: 'urgent',
      count: 3,
      next_action: {
        label: 'Review outcome surveys',
        route: '/surveys',
        intent: 'create_followup',
      },
      secondary_action: null,
    },
    {
      id: 'high-severity-unlinked',
      severity: 'urgent',
      count: 4,
      next_action: {
        label: 'Review high severity VOCs',
        route: '/vocs?view=inbox&tab=high-no-link',
        intent: 'triage',
      },
      secondary_action: null,
    },
    {
      id: 'permission-requests-pending',
      severity: 'info',
      count: 2,
      next_action: {
        label: 'Open Requests',
        route: '/admin/permissions/requests',
        intent: 'review_permissions',
      },
      secondary_action: null,
    },
  ],
  coverage: [
    { id: 'voc-task', value: 180, total: 1000, percent: 18, status: 'bad' },
    { id: 'finding-execution', value: 23, total: 31, percent: 74, status: 'warn' },
    { id: 'milestone-outcome', value: 9, total: 34, percent: 26, status: 'bad' },
    { id: 'high-followup', value: 41, total: 47, percent: 87, status: 'good' },
    { id: 'released-update', value: 12, total: 17, percent: 70, status: 'warn' },
    { id: 'analytics-area', value: 412, total: 612, percent: 67, status: 'warn' },
  ],
  by_managed_system: systemRows.map((row) => ({
    managed_system_id: row.managed_system_id,
    kpis: {
      open_voc: row.openVoc,
      active_finding: row.activeFinding,
      tasks_in_flight: row.tasksInFlight,
      coverage_percent: row.coveragePercent,
    },
    coverage: {
      'voc-task': {
        value: row.coveragePercent,
        total: 100,
        percent: row.coveragePercent,
        status: row.coveragePercent >= 75 ? 'good' : row.coveragePercent >= 40 ? 'warn' : 'bad',
      },
    },
    action_queues: { 'unassigned-voc': row.unassigned },
  })),
});

export const integrationDashboardEmptySummaryFixture = dashboardSummarySchema.parse({
  kpis: {},
  action_queues: [],
  coverage: [],
  by_managed_system: [],
});

export const integrationDashboardManagedSystemsFixture = {
  items: [
    ['tableau', INTEGRATION_DASHBOARD_IDS.tableau, 'Tableau'],
    ['power-bi', INTEGRATION_DASHBOARD_IDS.powerBi, 'Power BI'],
    ['looker', INTEGRATION_DASHBOARD_IDS.looker, 'Looker'],
    ['metabase', INTEGRATION_DASHBOARD_IDS.metabase, 'Metabase'],
  ].map(([slug, id, name]) => ({
    id,
    workspace_id: INTEGRATION_DASHBOARD_IDS.workspace,
    slug,
    name,
    external_key: null,
    default_owner_actor_id: null,
    default_owner_team_id: null,
    archived_at: null,
    archived_by_actor_id: null,
    created_at: '2026-07-10T00:00:00.000Z',
    updated_at: '2026-07-10T00:00:00.000Z',
  })),
  total: 4,
};

export const integrationDashboardVisualSnapshot = 'integration-action-dashboard.png';
export const integrationDashboardEmptyVisualSnapshot = 'integration-action-dashboard-empty.png';
export const integrationDashboardDeniedVisualSnapshot = 'integration-action-dashboard-denied.png';
