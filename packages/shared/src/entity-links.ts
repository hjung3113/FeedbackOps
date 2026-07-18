import { z } from 'zod';

export const entityLinkEntityTypeSchema = z.enum([
  'voc',
  'finding',
  'voc_cluster',
  'task_request',
  'task',
]);
export type EntityLinkEntityType = z.infer<typeof entityLinkEntityTypeSchema>;

export const entityLinkRelationTypeSchema = z.enum([
  'related_to',
  'created_finding',
  'evidence_of',
  'requested_task',
  'converted_to',
]);
export type EntityLinkRelationType = z.infer<typeof entityLinkRelationTypeSchema>;

export type EntityLinkPair = {
  source_type: EntityLinkEntityType;
  target_type: EntityLinkEntityType;
  relation_type: EntityLinkRelationType;
};

export const entityLinkVisibilitySchema = z.enum([
  'internal_only',
  'summary_visible',
  'visible_to_reporter',
  'admin_only',
]);
export type EntityLinkVisibility = z.infer<typeof entityLinkVisibilitySchema>;

export const creatableEntityLinkVisibilitySchema = z.literal('internal_only');

export const entityLinkStatusSchema = z.enum(['active', 'stale', 'detached', 'revoked']);
export type EntityLinkStatus = z.infer<typeof entityLinkStatusSchema>;

export const entityLinkVisibilityStateSchema = z.enum([
  'allowed',
  'hidden',
  'summary_visible',
  'denied',
]);
export type EntityLinkVisibilityState = z.infer<typeof entityLinkVisibilityStateSchema>;

export const entityLinkRefSchema = z.object({
  type: entityLinkEntityTypeSchema,
  id: z.string().uuid(),
});
export type EntityLinkRef = z.infer<typeof entityLinkRefSchema>;

export const entityLinkTargetSummarySchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('finding'),
      id: z.string().uuid(),
      display_id: z.string(),
      title: z.string(),
      summary: z.string(),
      severity: z.string(),
      confidence: z.string().nullable(),
      status: z.string(),
      primary_managed_system_id: z.string().uuid(),
      evidence_count: z.number(),
    })
    .strict(),
  z
    .object({
      type: z.literal('task'),
      id: z.string().uuid(),
      display_id: z.string(),
      title: z.string(),
      status: z.string(),
      priority: z.string(),
      primary_managed_system_id: z.string().uuid(),
      assignee_actor_id: z.string().uuid().nullable(),
      due_date: z.string().nullable(),
    })
    .strict(),
  z
    .object({
      type: z.literal('task_request'),
      id: z.string().uuid(),
      display_id: z.string(),
      source_type: z.string(),
      source_id: z.string().uuid(),
      evidence_summary: z.string(),
      requested_outcome: z.string(),
      status: z.string(),
      primary_managed_system_id: z.string().uuid(),
      requester_actor_id: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      type: z.literal('voc_cluster'),
      id: z.string().uuid(),
      display_id: z.string(),
      title: z.string(),
      summary: z.string().nullable(),
      status: z.string(),
      primary_managed_system_id: z.string().uuid(),
    })
    .strict(),
]);
export type EntityLinkTargetSummary = z.infer<typeof entityLinkTargetSummarySchema>;

export const registeredEntityLinkPairs = [
  { source_type: 'voc', target_type: 'voc', relation_type: 'related_to' },
  { source_type: 'voc', target_type: 'finding', relation_type: 'created_finding' },
  { source_type: 'voc', target_type: 'finding', relation_type: 'evidence_of' },
  { source_type: 'voc_cluster', target_type: 'finding', relation_type: 'created_finding' },
  { source_type: 'voc_cluster', target_type: 'finding', relation_type: 'evidence_of' },
  { source_type: 'finding', target_type: 'task_request', relation_type: 'requested_task' },
  { source_type: 'task_request', target_type: 'task', relation_type: 'converted_to' },
  { source_type: 'finding', target_type: 'task', relation_type: 'requested_task' },
  { source_type: 'voc', target_type: 'task', relation_type: 'evidence_of' },
  { source_type: 'voc', target_type: 'task_request', relation_type: 'requested_task' },
  {
    source_type: 'voc_cluster',
    target_type: 'task_request',
    relation_type: 'requested_task',
  },
] as const satisfies readonly EntityLinkPair[];

export type RegisteredEntityLinkPair = (typeof registeredEntityLinkPairs)[number];

const entityLinkPairKey = (pair: EntityLinkPair) =>
  `${pair.source_type}:${pair.target_type}:${pair.relation_type}`;

const registeredEntityLinkPairKeys = new Set(registeredEntityLinkPairs.map(entityLinkPairKey));

export function isRegisteredEntityLinkPair(input: unknown): input is RegisteredEntityLinkPair {
  if (input === null || typeof input !== 'object') return false;
  const maybePair = input as Partial<EntityLinkPair>;
  if (
    maybePair.source_type === undefined ||
    maybePair.target_type === undefined ||
    maybePair.relation_type === undefined
  ) {
    return false;
  }
  return registeredEntityLinkPairKeys.has(entityLinkPairKey(maybePair as EntityLinkPair));
}

function registeredEntityLinkPairOption(pair: RegisteredEntityLinkPair) {
  return z.object({
    source_type: z.literal(pair.source_type),
    target_type: z.literal(pair.target_type),
    relation_type: z.literal(pair.relation_type),
  });
}

export const registeredEntityLinkPairSchema = z.union(
  registeredEntityLinkPairs.map(registeredEntityLinkPairOption) as [
    ReturnType<typeof registeredEntityLinkPairOption>,
    ReturnType<typeof registeredEntityLinkPairOption>,
    ...ReturnType<typeof registeredEntityLinkPairOption>[],
  ],
) as unknown as z.ZodType<RegisteredEntityLinkPair>;

export const createEntityLinkRequestSchema = z
  .object({
    source: entityLinkRefSchema,
    target: entityLinkRefSchema,
    relation_type: entityLinkRelationTypeSchema,
    visibility: creatableEntityLinkVisibilitySchema.optional(),
  })
  .strict();
export type CreateEntityLinkRequest = z.infer<typeof createEntityLinkRequestSchema>;

export const detachEntityLinkRequestSchema = z
  .object({
    reason: z.string().trim().min(1),
  })
  .strict();
export type DetachEntityLinkRequest = z.infer<typeof detachEntityLinkRequestSchema>;

const csvEntityLinkStatusSchema = z
  .union([entityLinkStatusSchema, z.array(entityLinkStatusSchema)])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    return Array.isArray(value) ? value : [value];
  });

export const listEntityLinksQuerySchema = z
  .object({
    scope: z.literal('workspace').optional(),
    source_type: entityLinkEntityTypeSchema.optional(),
    source_id: z.string().uuid().optional(),
    target_type: entityLinkEntityTypeSchema.optional(),
    target_id: z.string().uuid().optional(),
    status: csvEntityLinkStatusSchema,
    relation_type: entityLinkRelationTypeSchema.optional(),
    managed_system_id: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasSource = value.source_type !== undefined || value.source_id !== undefined;
    const hasTarget = value.target_type !== undefined || value.target_id !== undefined;
    const hasEndpoint = hasSource || hasTarget;
    const hasInventoryFilter =
      value.status !== undefined ||
      value.relation_type !== undefined ||
      value.managed_system_id !== undefined;

    if (value.scope === 'workspace' && hasEndpoint) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scope'],
        message: 'workspace scope cannot be combined with source or target endpoint',
      });
    }
    if (value.scope !== 'workspace' && hasInventoryFilter && hasEndpoint) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: 'inventory filters require workspace scope',
      });
    }
    if (hasSource && (value.source_type === undefined || value.source_id === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['source_id'],
        message: 'source_type and source_id must be provided together',
      });
    }
    if (hasTarget && (value.target_type === undefined || value.target_id === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['target_id'],
        message: 'target_type and target_id must be provided together',
      });
    }
    if (value.scope !== 'workspace' && hasEndpoint && hasSource === hasTarget) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: 'provide exactly one source or target endpoint',
      });
    }
  });
export type ListEntityLinksQuery = z.infer<typeof listEntityLinksQuerySchema>;

export const allowedEntityLinkSchema = z.object({
  id: z.string().uuid(),
  source_type: entityLinkEntityTypeSchema,
  source_id: z.string().uuid(),
  target_type: entityLinkEntityTypeSchema,
  target_id: z.string().uuid(),
  target_summary: entityLinkTargetSummarySchema.optional(),
  relation_type: entityLinkRelationTypeSchema,
  visibility: entityLinkVisibilitySchema,
  status: entityLinkStatusSchema,
  managed_system_id: z.string().uuid(),
  created_by: z.string().uuid(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime().nullable(),
  visibility_state: z.literal('allowed'),
});

export const hiddenEntityLinkSchema = z.object({
  id: z.string().uuid(),
  source_type: entityLinkEntityTypeSchema,
  target_type: entityLinkEntityTypeSchema,
  relation_type: entityLinkRelationTypeSchema,
  status: entityLinkStatusSchema,
  managed_system_id: z.string().uuid(),
  created_by: z.string().uuid(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime().nullable(),
  visibility_state: z.literal('hidden'),
});

export const deniedEntityLinkSchema = hiddenEntityLinkSchema.extend({
  visibility_state: z.literal('denied'),
});

export const taskReporterSummarySchema = z
  .object({
    target_type: z.literal('task'),
    public_title: z.string(),
    reporter_facing_status: z.string(),
    owning_team_public_name: z.string().optional(),
    expected_resolution_date: z.string().optional(),
    last_public_update_at: z.string().datetime(),
    public_update_excerpt: z.string().optional(),
  })
  .strict();
export type TaskReporterSummary = z.infer<typeof taskReporterSummarySchema>;

export const summaryVisibleEntityLinkSchema = hiddenEntityLinkSchema.extend({
  visibility_state: z.literal('summary_visible'),
  summary: taskReporterSummarySchema,
});

export const entityLinkDtoSchema = z.discriminatedUnion('visibility_state', [
  allowedEntityLinkSchema,
  hiddenEntityLinkSchema,
  summaryVisibleEntityLinkSchema,
  deniedEntityLinkSchema,
]);
export type EntityLinkDto = z.infer<typeof entityLinkDtoSchema>;

export const listEntityLinksResponseSchema = z.object({
  items: z.array(entityLinkDtoSchema),
});
export type ListEntityLinksResponse = z.infer<typeof listEntityLinksResponseSchema>;

export const detachedEntityLinkResponseSchema = z.object({
  id: z.string().uuid(),
  status: z.literal('detached'),
  detached_at: z.string().datetime(),
});
export type DetachedEntityLinkResponse = z.infer<typeof detachedEntityLinkResponseSchema>;
