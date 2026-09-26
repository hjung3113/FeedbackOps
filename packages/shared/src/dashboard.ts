import { z } from 'zod';

export const DASHBOARD_UNASSIGNED_VOC_ROUTE = '/vocs?view=inbox&tab=unassigned';
export const DASHBOARD_HIGH_SEVERITY_UNLINKED_ROUTE = '/vocs?view=inbox&tab=high-no-link';
export const DASHBOARD_ACTIONABLE_FINDINGS_ROUTE = '/findings';
export const DASHBOARD_RELEASED_TASKS_ROUTE = '/tasks?view=board';
export const DASHBOARD_OUTCOME_SURVEYS_ROUTE = '/surveys';
export const DASHBOARD_PERMISSION_REQUESTS_ROUTE = '/admin/permissions/requests';

const dashboardActionSchema = z.object({
  label: z.string(),
  route: z.string(),
  intent: z.string(),
}).strict();

const dashboardCoverageCellSchema = z.object({
  value: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  percent: z.number().int().min(0).max(100),
  status: z.enum(['good', 'warn', 'bad']),
}).strict();

export const dashboardSummarySchema = z.object({
  kpis: z.object({
    open_voc: z.number().int().nonnegative().optional(),
    active_finding: z.number().int().nonnegative().optional(),
    pending_request: z.number().int().nonnegative().optional(),
    tasks_in_flight: z.number().int().nonnegative().optional(),
    coverage_percent: z.number().int().min(0).max(100).optional(),
  }).strict(),
  action_queues: z.array(z.object({
    id: z.enum([
      'unassigned-voc',
      'high-severity-unlinked',
      'actionable-finding-no-execution',
      'released-task-unresolved-voc',
      'bad-outcome-no-followup',
      'permission-requests-pending',
    ]),
    severity: z.enum(['urgent', 'warn', 'info']),
    count: z.number().int().nonnegative(),
    next_action: dashboardActionSchema,
    secondary_action: dashboardActionSchema.nullable(),
  }).strict()),
  coverage: z.array(z.object({
    id: z.enum(['voc-task', 'finding-execution', 'milestone-outcome', 'high-followup', 'released-update', 'analytics-area']),
    value: dashboardCoverageCellSchema.shape.value,
    total: dashboardCoverageCellSchema.shape.total,
    percent: dashboardCoverageCellSchema.shape.percent,
    status: dashboardCoverageCellSchema.shape.status,
  }).strict()),
  by_managed_system: z.array(z.object({
    managed_system_id: z.string().uuid(),
    coverage: z.object({
      'voc-task': dashboardCoverageCellSchema.optional(),
      'finding-execution': dashboardCoverageCellSchema.optional(),
      'high-followup': dashboardCoverageCellSchema.optional(),
      'released-update': dashboardCoverageCellSchema.optional(),
      'analytics-area': dashboardCoverageCellSchema.optional(),
    }).strict().optional(),
    action_queues: z.object({
      'unassigned-voc': z.number().int().nonnegative().optional(),
      'high-severity-unlinked': z.number().int().nonnegative().optional(),
      'actionable-finding-no-execution': z.number().int().nonnegative().optional(),
      'released-task-unresolved-voc': z.number().int().nonnegative().optional(),
      'bad-outcome-no-followup': z.number().int().nonnegative().optional(),
      // Workspace-level queue (plan: "see risk on N6"). The schema admits the
      // key per the locked response shape, but the service never emits it on
      // a system row — omitting it is the absence rule, not a zero.
      'permission-requests-pending': z.number().int().nonnegative().optional(),
    }).strict().optional(),
    analytics_areas: z.array(z.object({
      analytics_area_id: z.string().uuid(),
      coverage: z.object({
        'voc-task': dashboardCoverageCellSchema.optional(),
        'high-followup': dashboardCoverageCellSchema.optional(),
      }).strict().optional(),
      action_queues: z.object({
        'unassigned-voc': z.number().int().nonnegative().optional(),
        'high-severity-unlinked': z.number().int().nonnegative().optional(),
      }).strict().optional(),
    }).strict()).optional(),
  }).strict()),
}).strict();

export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
