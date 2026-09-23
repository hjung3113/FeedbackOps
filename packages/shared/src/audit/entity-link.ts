// Entity-link audit detail schemas (Slice 4.1 #112 / Slice 4.2 #113).
// `entity_link.created` traces a canonical link row; `entity_link.detached`
// records the audited soft detach. The dotted event names are already
// shipped and stored in `audit_log.event_type`; new event names follow the
// policy-doc snake_case style, but these two must not be renamed.
// Imported by audit-events.ts to register into AUDIT_EVENT_DETAIL_SCHEMAS.

import { z } from 'zod';

export const ENTITY_LINK_AUDIT_EVENT_TYPES = [
  'entity_link.created',
  'entity_link.detached',
] as const;

const vocRefDetailSchema = z.object({
  type: z.literal('voc'),
  id: z.string().uuid(),
});

// Entity-link audits are internal-only operational records.  Like the VOC
// variants above they identify the source by UUID, but never carry response
// content or respondent fields.
const surveyResponseRefDetailSchema = z.object({
  type: z.literal('survey_response'),
  id: z.string().uuid(),
});

const vocClusterRefDetailSchema = z.object({
  type: z.literal('voc_cluster'),
  id: z.string().uuid(),
});

const findingRefDetailSchema = z.object({
  type: z.literal('finding'),
  id: z.string().uuid(),
});

const taskRequestRefDetailSchema = z.object({
  type: z.literal('task_request'),
  id: z.string().uuid(),
});

const taskRefDetailSchema = z.object({
  type: z.literal('task'),
  id: z.string().uuid(),
});

export const entityLinkCreatedDetailSchema = z.union([
  z.object({
    link_id: z.string().uuid(),
    source: vocRefDetailSchema,
    target: vocRefDetailSchema,
    relation_type: z.literal('related_to'),
    visibility: z.literal('internal_only'),
  }),
  z.object({
    link_id: z.string().uuid(),
    source: vocClusterRefDetailSchema,
    target: findingRefDetailSchema,
    relation_type: z.literal('evidence_of'),
    visibility: z.literal('internal_only'),
  }),
  z.object({
    link_id: z.string().uuid(),
    source: vocRefDetailSchema,
    target: findingRefDetailSchema,
    relation_type: z.literal('created_finding'),
    visibility: z.literal('internal_only'),
  }),
  z.object({
    link_id: z.string().uuid(),
    source: vocRefDetailSchema,
    target: findingRefDetailSchema,
    relation_type: z.literal('evidence_of'),
    visibility: z.literal('internal_only'),
  }),
  z.object({
    link_id: z.string().uuid(),
    source: vocClusterRefDetailSchema,
    target: findingRefDetailSchema,
    relation_type: z.literal('created_finding'),
    visibility: z.literal('internal_only'),
  }),
  z.object({
    link_id: z.string().uuid(),
    source: findingRefDetailSchema,
    target: taskRequestRefDetailSchema,
    relation_type: z.literal('requested_task'),
    visibility: z.literal('internal_only'),
  }),
  z.object({
    link_id: z.string().uuid(),
    source: vocRefDetailSchema,
    target: taskRequestRefDetailSchema,
    relation_type: z.literal('requested_task'),
    visibility: z.literal('internal_only'),
  }),
  z.object({
    link_id: z.string().uuid(),
    source: vocClusterRefDetailSchema,
    target: taskRequestRefDetailSchema,
    relation_type: z.literal('requested_task'),
    visibility: z.literal('internal_only'),
  }),
  z.object({
    link_id: z.string().uuid(),
    source: taskRequestRefDetailSchema,
    target: taskRefDetailSchema,
    relation_type: z.literal('converted_to'),
    visibility: z.literal('internal_only'),
  }),
  z.object({
    link_id: z.string().uuid(),
    source: findingRefDetailSchema,
    target: taskRefDetailSchema,
    relation_type: z.literal('requested_task'),
    visibility: z.literal('internal_only'),
  }),
  z.object({
    link_id: z.string().uuid(),
    source: vocRefDetailSchema,
    target: taskRefDetailSchema,
    relation_type: z.literal('evidence_of'),
    visibility: z.literal('internal_only'),
  }),
  z
    .object({
      link_id: z.string().uuid(),
      source: surveyResponseRefDetailSchema,
      target: findingRefDetailSchema,
      relation_type: z.literal('generated_finding'),
      visibility: z.literal('internal_only'),
    })
    .strict(),
  z
    .object({
      link_id: z.string().uuid(),
      source: surveyResponseRefDetailSchema,
      target: findingRefDetailSchema,
      relation_type: z.literal('evidence_of'),
      visibility: z.literal('internal_only'),
    })
    .strict(),
]);
export type EntityLinkCreatedDetail = z.infer<typeof entityLinkCreatedDetailSchema>;

export const entityLinkDetachedDetailSchema = z.union([
  z.object({
    link_id: z.string().uuid(),
    source: vocRefDetailSchema,
    target: vocRefDetailSchema,
    relation_type: z.literal('related_to'),
    reason: z.string().min(1),
  }),
  z.object({
    link_id: z.string().uuid(),
    source: vocRefDetailSchema,
    target: findingRefDetailSchema,
    relation_type: z.literal('created_finding'),
    reason: z.string().min(1),
  }),
  z.object({
    link_id: z.string().uuid(),
    source: vocRefDetailSchema,
    target: findingRefDetailSchema,
    relation_type: z.literal('evidence_of'),
    reason: z.string().min(1),
  }),
  z.object({
    link_id: z.string().uuid(),
    source: vocClusterRefDetailSchema,
    target: findingRefDetailSchema,
    relation_type: z.literal('created_finding'),
    reason: z.string().min(1),
  }),
  z.object({
    link_id: z.string().uuid(),
    source: vocClusterRefDetailSchema,
    target: findingRefDetailSchema,
    relation_type: z.literal('evidence_of'),
    reason: z.string().min(1),
  }),
  z.object({
    link_id: z.string().uuid(),
    source: findingRefDetailSchema,
    target: taskRequestRefDetailSchema,
    relation_type: z.literal('requested_task'),
    reason: z.string().min(1),
  }),
]);
export type EntityLinkDetachedDetail = z.infer<typeof entityLinkDetachedDetailSchema>;

export const ENTITY_LINK_AUDIT_EVENT_DETAIL_SCHEMAS = {
  'entity_link.created': entityLinkCreatedDetailSchema,
  'entity_link.detached': entityLinkDetachedDetailSchema,
} as const satisfies Record<
  (typeof ENTITY_LINK_AUDIT_EVENT_TYPES)[number],
  z.ZodTypeAny
>;
