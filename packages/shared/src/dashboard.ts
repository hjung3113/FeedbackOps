import { z } from 'zod';

export const DASHBOARD_UNASSIGNED_VOC_ROUTE = '/vocs?view=inbox&tab=unassigned';
export const DASHBOARD_HIGH_SEVERITY_UNLINKED_ROUTE = '/vocs?view=inbox&tab=high-no-link';
export const DASHBOARD_ACTIONABLE_FINDINGS_ROUTE = '/findings';
export const DASHBOARD_RELEASED_TASKS_ROUTE = '/tasks?view=board';
export const DASHBOARD_OUTCOME_SURVEYS_ROUTE = '/surveys';
export const DASHBOARD_PERMISSION_REQUESTS_ROUTE = '/admin/permissions/requests';

export const COVERAGE_METRIC_IDS = [
  'voc-task',
  'finding-execution',
  'high-followup',
  'released-update',
  'analytics-area',
] as const;
export type CoverageMetricId = (typeof COVERAGE_METRIC_IDS)[number];

export const coverageThresholdPairSchema = z
  .object({
    good_min_percent: z.number().int().min(1).max(100),
    warn_min_percent: z.number().int().min(0).max(99),
  })
  .strict()
  .refine((pair) => pair.warn_min_percent < pair.good_min_percent, {
    message: 'warn_min_percent must be less than good_min_percent',
  });
export type CoverageThresholdPair = z.infer<typeof coverageThresholdPairSchema>;

export const coverageThresholdsSchema = z
  .object({
    'voc-task': coverageThresholdPairSchema,
    'finding-execution': coverageThresholdPairSchema,
    'high-followup': coverageThresholdPairSchema,
    'released-update': coverageThresholdPairSchema,
    'analytics-area': coverageThresholdPairSchema,
  })
  .strict();
export const coverageThresholdsPatchSchema = coverageThresholdsSchema
  .partial()
  .refine((bands) => Object.keys(bands).length > 0, {
    message: 'at least one Coverage metric is required',
  });
export type CoverageThresholds = z.infer<typeof coverageThresholdsSchema>;

export function resolveCoverageThresholds(
  stored?: Partial<CoverageThresholds> | null,
): CoverageThresholds {
  return {
    'voc-task': stored?.['voc-task'] ?? { good_min_percent: 75, warn_min_percent: 40 },
    'finding-execution': stored?.['finding-execution'] ?? {
      good_min_percent: 75,
      warn_min_percent: 40,
    },
    'high-followup': stored?.['high-followup'] ?? { good_min_percent: 75, warn_min_percent: 40 },
    'released-update': stored?.['released-update'] ?? {
      good_min_percent: 75,
      warn_min_percent: 40,
    },
    'analytics-area': stored?.['analytics-area'] ?? { good_min_percent: 75, warn_min_percent: 40 },
  };
}

const dashboardActionSchema = z.object({
  label: z.string(),
  route: z.string(),
  intent: z.string(),
}).strict();

const dashboardCoverageCellSchema = z.object({
  value: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  percent: z.number().int().min(0).max(100),
  status: z.enum(['good', 'warn', 'bad', 'no_data']),
}).strict();

export const dashboardSummarySchema = z.object({
  computed_at: z.string().datetime(),
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
    kpis: z.object({
      open_voc: z.number().int().nonnegative().optional(),
      active_finding: z.number().int().nonnegative().optional(),
      tasks_in_flight: z.number().int().nonnegative().optional(),
      coverage_percent: z.number().int().min(0).max(100).optional(),
    }).strict().optional(),
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

export type DashboardCoverageId = DashboardSummary['coverage'][number]['id'];
export type DashboardActionQueueId = DashboardSummary['action_queues'][number]['id'];
// milestone-outcome is a reserved coverage id that is never emitted (no
// Milestone-outcome coverage definition exists yet), so it stays out of the
// hop map (plan-513: "milestone-outcome. Keep omitting it.").
export type DashboardHopId = Exclude<DashboardCoverageId, 'milestone-outcome'> | DashboardActionQueueId;

// One coverage/queue id -> filtered-list URL map, shared by the coverage page
// and Home so the two screens cannot drift (plan-513 one-hop routes table).
// Every target must stay listed in its route's strict search schema:
// /vocs (tab, filter.analytics_area), /findings (execution),
// /tasks (public_update), /surveys, /admin/permissions/requests.
// voc-task must not reuse the no-link tab: it is the "no voc -> task link"
// complement, not the follow-up predicate (plan-513, N9).
export const DASHBOARD_HOP_ROUTES = {
  'voc-task': '/vocs?view=inbox&tab=no-task',
  'finding-execution': '/findings?execution=none',
  'high-followup': '/vocs?view=inbox&tab=high-no-link',
  'released-update': '/tasks?view=board&public_update=missing',
  'analytics-area': '/vocs?view=inbox&filter.analytics_area=unset',
  'unassigned-voc': DASHBOARD_UNASSIGNED_VOC_ROUTE,
  'high-severity-unlinked': DASHBOARD_HIGH_SEVERITY_UNLINKED_ROUTE,
  'actionable-finding-no-execution': '/findings?execution=none',
  'released-task-unresolved-voc': DASHBOARD_RELEASED_TASKS_ROUTE,
  'bad-outcome-no-followup': DASHBOARD_OUTCOME_SURVEYS_ROUTE,
  'permission-requests-pending': DASHBOARD_PERMISSION_REQUESTS_ROUTE,
} as const satisfies Record<DashboardHopId, string>;

// Stable addresses are shared by the live queue and personal presentation/history.
export const RECOVERY_CATEGORIES = [
  'unassigned-voc',
  'high-severity-unlinked',
  'actionable-finding-no-execution',
  'released-task-unresolved-voc',
  'bad-outcome-no-followup',
  'permission-requests-pending',
] as const;
export const recoveryCategorySchema = z.enum(RECOVERY_CATEGORIES);
export type RecoveryCategory = z.infer<typeof recoveryCategorySchema>;
export const recoveryListQuerySchema = z
  .object({
    category: recoveryCategorySchema.optional(),
    managed_system_id: z.union([z.string().uuid(), z.literal('all')]).optional(),
    view: z.enum(['operational', 'actionable']).default('operational'),
    presentation: z.enum(['visible', 'hidden']).default('visible'),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().min(1).max(4096).optional(),
  })
  .strict();
export type RecoveryListQuery = z.infer<typeof recoveryListQuerySchema>;
export const recoveryPresentationPatchSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('snooze'), days: z.union([z.literal(1), z.literal(7)]) }).strict(),
  z.object({ action: z.literal('mute') }).strict(),
  z.object({ action: z.literal('restore') }).strict(),
]);
export type RecoveryPresentationPatch = z.infer<typeof recoveryPresentationPatchSchema>;
export const recoveryPresentationSchema = z
  .object({
    state: z.enum(['visible', 'snoozed', 'muted']),
    snoozed_until: z.string().datetime().nullable(),
  })
  .strict()
  .refine((value) => (value.state === 'snoozed') === (value.snoozed_until !== null), {
    path: ['snoozed_until'],
    message: 'snoozed state requires an expiry; other states forbid it',
  });
export const recoveryResolutionSchema = z
  .object({
    resolved_at: z.string().datetime(),
    outcome: z.enum(['resolved', 'withdrawn']),
    evidence: z.enum(['command', 'observation']),
    action: z.string().nullable(),
  })
  .strict();
export const recoveryHistoryQuerySchema = recoveryListQuerySchema
  .omit({
    view: true,
    presentation: true,
  })
  .strict();
export type RecoveryHistoryQuery = z.infer<typeof recoveryHistoryQuerySchema>;
const internalRouteSchema = z.string().regex(/^\/(?!\/)[^\\]*$/);
export const recoveryActionSchema = z
  .object({
    id: z.enum([
      'triage',
      'plan_execution',
      'write_public_update',
      'review_permission',
      'create_finding',
    ]),
    label: z.string(),
    availability: z.enum(['available', 'blocked_requestable', 'blocked_not_requestable']),
    blocked_reason: z.string().nullable(),
    requestable_permission: z
      .object({ permission: z.string(), managed_system_id: z.string().uuid() })
      .strict()
      .nullable(),
    target: z
      .object({
        source_type: z.enum(['voc', 'finding', 'permission_request', 'survey']),
        source_id: z.string().uuid(),
        route: internalRouteSchema,
        endpoint: internalRouteSchema.nullable(),
        method: z.enum(['POST', 'PATCH']).nullable(),
        intent: z.string(),
      })
      .strict(),
    confirmation: z
      .object({
        required: z.boolean(),
        title: z.string(),
        body: z.string(),
        risk_level: z.enum(['low', 'medium', 'high']),
        reason_required: z.boolean(),
        audit_event_intent: z.string().nullable(),
      })
      .strict(),
  })
  .strict()
  .superRefine((action, context) => {
    if (
      action.availability === 'available' &&
      (action.blocked_reason !== null || action.requestable_permission !== null)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['availability'],
        message: 'available action cannot be blocked',
      });
    }
    if (action.availability !== 'available' && action.blocked_reason === null) {
      context.addIssue({
        code: 'custom',
        path: ['blocked_reason'],
        message: 'blocked action requires a reason',
      });
    }
    if (action.availability === 'blocked_requestable' && action.requestable_permission === null) {
      context.addIssue({
        code: 'custom',
        path: ['requestable_permission'],
        message: 'requestable action requires a permission candidate',
      });
    }
    if ((action.target.endpoint === null) !== (action.target.method === null)) {
      context.addIssue({
        code: 'custom',
        path: ['target'],
        message: 'endpoint and method must be specified together',
      });
    }
  });
export type RecoveryAction = z.infer<typeof recoveryActionSchema>;
export const recoverySourceSchema = z
  .object({
    type: z.enum(['voc', 'finding', 'task', 'permission_request', 'survey']),
    id: z.string().uuid(),
    display_id: z.string().nullable(),
    title: z.string(),
    route: internalRouteSchema,
  })
  .strict();
export const recoveryResponsibilitySchema = z
  .object({
    kind: z.enum(['actor', 'team', 'unassigned', 'multiple', 'admin_queue']),
    label: z.string(),
    actor_id: z.string().uuid().optional(),
    team_id: z.string().uuid().optional(),
  })
  .strict();
export const recoveryItemSchema = z
  .object({
    recovery_item_id: z.string().regex(/^r1_[A-Za-z0-9_-]{23}$/),
    category: recoveryCategorySchema,
    state: z.enum(['active', 'resolved', 'withdrawn']),
    occurrence: z.number().int().positive().nullable(),
    presentation: recoveryPresentationSchema,
    resolution: recoveryResolutionSchema.nullable(),
    reason_code: recoveryCategorySchema,
    reason: z.string(),
    priority: z.number().int().nonnegative(),
    severity: z.enum(['urgent', 'warn', 'info']),
    managed_system_id: z.string().uuid().nullable(),
    source: recoverySourceSchema.nullable(),
    affected: z.array(recoverySourceSchema).max(100),
    next_actions: z.array(recoveryActionSchema),
    responsible_actor_hint: recoveryResponsibilitySchema,
  })
  .strict();
export type RecoveryItem = z.infer<typeof recoveryItemSchema>;
export const recoveryListSchema = z
  .object({
    computed_at: z.string().datetime(),
    items: z.array(recoveryItemSchema).max(100),
    total: z.number().int().nonnegative(),
    visible_total: z.number().int().nonnegative(),
    hidden_total: z.number().int().nonnegative(),
    page: z.object({ has_more: z.boolean(), cursor: z.string().optional() }).strict(),
  })
  .strict();
export type RecoveryList = z.infer<typeof recoveryListSchema>;
export const recoveryDetailSchema = recoveryItemSchema
  .extend({ computed_at: z.string().datetime() })
  .strict();
export type RecoveryDetail = z.infer<typeof recoveryDetailSchema>;
export const recoveryHistorySchema = z.object({
  computed_at: z.string().datetime(),
  window_start: z.string().datetime(),
  items: z.array(z.object({
    id: z.string().uuid(),
    item: recoveryItemSchema,
    occurrence: z.number().int().positive(),
    resolution: recoveryResolutionSchema,
  }).strict()).max(100),
  total: z.number().int().nonnegative(),
  page: z.object({ has_more: z.boolean(), cursor: z.string().optional() }).strict(),
}).strict();
export type RecoveryHistory = z.infer<typeof recoveryHistorySchema>;

// ADR-0069: the report and Coverage consumer share exact destination search keys.
const areaReportDestinations = {
  'voc.total': ['/vocs', { view: 'inbox' }],
  'voc.unassigned': ['/vocs', { view: 'inbox', tab: 'unassigned' }],
  'voc.high_no_followup': ['/vocs', { view: 'inbox', tab: 'high-no-link' }],
  'voc.task_link': ['/vocs', { view: 'inbox', tab: 'no-task' }],
  'finding.active': ['/findings', { status: 'active' }],
  'finding.execution': ['/findings', { execution: 'none' }],
  'finding.no_execution': ['/findings', { execution: 'none' }],
  'task.backlog': ['/tasks', { view: 'backlog', status: 'backlog' }],
  'task.todo': ['/tasks', { view: 'backlog', status: 'todo' }],
  'task.doing': ['/tasks', { view: 'backlog', status: 'doing' }],
  'task.review': ['/tasks', { view: 'backlog', status: 'review' }],
  'task.done': ['/tasks', { view: 'backlog', status: 'done' }],
  'task.released': ['/tasks', { view: 'backlog', status: 'released' }],
  'task.reopened': ['/tasks', { view: 'backlog', status: 'reopened' }],
  'task.in_flight': ['/tasks', { view: 'backlog', status_group: 'in-flight' }],
  'task.overdue': ['/tasks', { view: 'backlog', overdue: 'true' }],
  'task.released_update': ['/tasks', { view: 'backlog', public_update: 'missing' }],
  'task.public_update_missing': ['/tasks', { view: 'backlog', public_update: 'missing' }],
  'task.reporter_update_needed': ['/tasks', { view: 'backlog', reporter_update: 'needed' }],
  'survey.open': ['/surveys', { status: 'open' }],
  'survey.follow_up_needed': ['/surveys', { follow_up: 'needed' }],
} as const;
export type AreaReportMetric = keyof typeof areaReportDestinations;
export const areaReportLinkSchema = z
  .object({
    pathname: z.enum(['/vocs', '/findings', '/tasks', '/surveys']),
    search: z.record(z.string()),
  })
  .strict();
export type AreaReportLink = z.infer<typeof areaReportLinkSchema>;
export function areaReportLink(
  metric: AreaReportMetric,
  managedSystemId: string,
  analyticsAreaId: string | null,
): AreaReportLink {
  const [pathname, search] = areaReportDestinations[metric];
  return {
    pathname,
    search: {
      managedSystem: managedSystemId,
      'filter.analytics_area': analyticsAreaId ?? 'unset',
      ...search,
    },
  };
}
export const dashboardAreaReportQuerySchema = z
  .object({
    managed_system_id: z.union([z.string().uuid(), z.literal('all')]).optional(),
    analytics_area_id: z.union([z.string().uuid(), z.literal('unset')]).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().min(1).max(4096).optional(),
  })
  .strict();
export type DashboardAreaReportQuery = z.infer<typeof dashboardAreaReportQuerySchema>;
const areaCountSchema = z
  .object({ count: z.number().int().nonnegative(), link: areaReportLinkSchema.optional() })
  .strict();
const areaRatioSchema = z
  .object({
    value: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    link: areaReportLinkSchema.optional(),
  })
  .strict();
const areaClassificationSchema = z
  .object({ classified: z.number().int().nonnegative(), total: z.number().int().nonnegative() })
  .strict();
export const dashboardAreaReportSchema = z
  .object({
    computed_at: z.string().datetime(),
    as_of_date: z.string().date(),
    items: z
      .array(
        z
          .object({
            managed_system_id: z.string().uuid(),
            managed_system_name: z.string(),
            managed_system_archived: z.boolean(),
            analytics_area_id: z.string().uuid().nullable(),
            analytics_area_name: z.string().nullable(),
            analytics_area_archived: z.boolean(),
            voc: z
              .object({
                total: areaCountSchema,
                unassigned: areaCountSchema,
                high_no_followup: areaCountSchema,
                task_link: areaRatioSchema,
              })
              .strict()
              .optional(),
            finding: z
              .object({
                active: areaCountSchema,
                execution: areaRatioSchema,
                no_execution: areaCountSchema,
              })
              .strict()
              .optional(),
            task: z
              .object({
                by_status: z
                  .object({
                    backlog: areaCountSchema,
                    todo: areaCountSchema,
                    doing: areaCountSchema,
                    review: areaCountSchema,
                    done: areaCountSchema,
                    released: areaCountSchema,
                    reopened: areaCountSchema,
                  })
                  .strict(),
                in_flight: areaCountSchema,
                overdue: areaCountSchema,
                released_update: areaRatioSchema.optional(),
                public_update_missing: areaCountSchema.optional(),
                reporter_update_needed: areaCountSchema.optional(),
              })
              .strict()
              .optional(),
            survey: z
              .object({ open: areaCountSchema, follow_up_needed: areaCountSchema })
              .strict()
              .optional(),
          })
          .strict(),
      )
      .max(100),
    page: z.object({ has_more: z.boolean(), cursor: z.string().optional() }).strict(),
    classification_context: z.array(
      z
        .object({
          managed_system_id: z.string().uuid(),
          voc: areaClassificationSchema.optional(),
          finding: areaClassificationSchema.optional(),
          task: areaClassificationSchema.optional(),
          survey: areaClassificationSchema.optional(),
        })
        .strict(),
    ),
  })
  .strict();
export type DashboardAreaReport = z.infer<typeof dashboardAreaReportSchema>;

