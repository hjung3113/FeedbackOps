import { z } from 'zod';

const dashboardActionSchema = z.object({
  label: z.string(),
  route: z.string(),
  intent: z.string(),
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
    value: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    percent: z.number().int().min(0).max(100),
    status: z.enum(['good', 'warn', 'bad']),
  }).strict()),
}).strict();

export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
