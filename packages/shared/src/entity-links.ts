import { z } from 'zod';

export const entityLinkEntityTypeSchema = z.enum(['voc']);
export type EntityLinkEntityType = z.infer<typeof entityLinkEntityTypeSchema>;

export const entityLinkRelationTypeSchema = z.enum(['related_to']);
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

export const entityLinkVisibilityStateSchema = z.enum(['allowed', 'hidden']);
export type EntityLinkVisibilityState = z.infer<typeof entityLinkVisibilityStateSchema>;

export const entityLinkRefSchema = z.object({
  type: entityLinkEntityTypeSchema,
  id: z.string().uuid(),
});
export type EntityLinkRef = z.infer<typeof entityLinkRefSchema>;

export const createEntityLinkRequestSchema = z
  .object({
    source: entityLinkRefSchema,
    target: entityLinkRefSchema,
    relation_type: entityLinkRelationTypeSchema,
    visibility: creatableEntityLinkVisibilitySchema.optional(),
  })
  .strict();
export type CreateEntityLinkRequest = z.infer<typeof createEntityLinkRequestSchema>;

export const listEntityLinksQuerySchema = z
  .object({
    source_type: entityLinkEntityTypeSchema.optional(),
    source_id: z.string().uuid().optional(),
    target_type: entityLinkEntityTypeSchema.optional(),
    target_id: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasSource = value.source_type !== undefined || value.source_id !== undefined;
    const hasTarget = value.target_type !== undefined || value.target_id !== undefined;
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
    if (hasSource === hasTarget) {
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
  visibility_state: z.literal('hidden'),
});

export const entityLinkDtoSchema = z.discriminatedUnion('visibility_state', [
  allowedEntityLinkSchema,
  hiddenEntityLinkSchema,
]);
export type EntityLinkDto = z.infer<typeof entityLinkDtoSchema>;

export const listEntityLinksResponseSchema = z.object({
  items: z.array(entityLinkDtoSchema),
});
export type ListEntityLinksResponse = z.infer<typeof listEntityLinksResponseSchema>;
