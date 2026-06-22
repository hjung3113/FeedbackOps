import { z } from 'zod';

export const entityLinkEntityTypeSchema = z.enum(['voc', 'finding', 'voc_cluster']);
export type EntityLinkEntityType = z.infer<typeof entityLinkEntityTypeSchema>;

export const entityLinkRelationTypeSchema = z.enum([
  'related_to',
  'created_finding',
  'evidence_of',
]);
export type EntityLinkRelationType = z.infer<typeof entityLinkRelationTypeSchema>;

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

export const registeredEntityLinkPairSchema = z.union([
  z.object({
    source_type: z.literal('voc'),
    target_type: z.literal('voc'),
    relation_type: z.literal('related_to'),
  }),
  z.object({
    source_type: z.literal('voc'),
    target_type: z.literal('finding'),
    relation_type: z.literal('created_finding'),
  }),
  z.object({
    source_type: z.literal('voc'),
    target_type: z.literal('finding'),
    relation_type: z.literal('evidence_of'),
  }),
  z.object({
    source_type: z.literal('voc_cluster'),
    target_type: z.literal('finding'),
    relation_type: z.literal('created_finding'),
  }),
]);
export type RegisteredEntityLinkPair = z.infer<typeof registeredEntityLinkPairSchema>;

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
