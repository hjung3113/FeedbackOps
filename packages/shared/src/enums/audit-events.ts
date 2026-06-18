// Audit event vocabulary. The canonical verb list is locked verbatim by
// docs/implementation/05-permission-policy.md:146-156 (snake_case, single
// token, no dot — e.g. `permission_requested`, `permission_approved`).
// ADR-0008's older `subject_type.verb` convention is a non-binding stylistic
// suggestion and explicitly defers to the policy doc's verb vocabulary for
// any event listed there. New events MUST take their name from that list,
// or — if no policy-doc entry exists — adopt the same snake_case style.
//
// Both apps import the canonical list from `@fops/shared`. Slice 1 (#5)
// ships exactly one event: `permission_requested`.
//
// New events MUST add (a) the event_type string to AUDIT_EVENT_TYPES and (b)
// a zod schema for the `detail` payload in AUDIT_EVENT_DETAIL_SCHEMAS so the
// audit service can validate the call site at write time.

import { z } from 'zod';

import { attachmentUploadedDetailSchema } from '../audit/attachments.js';
import {
  internalCommentCreatedDetailSchema,
  publicUpdateCreatedDetailSchema,
  reporterFacingStatusChangedDetailSchema,
  reporterReplyCreatedDetailSchema,
  vocAnalyticsAreaLinkedDetailSchema,
  vocClusterDecisionRecordedDetailSchema,
  vocCreatedDetailSchema,
  vocDescriptionEditedDetailSchema,
  vocOwnerAssignedDetailSchema,
  vocSeveritySetDetailSchema,
  vocTriageCommittedDetailSchema,
  vocTriagePostponedDetailSchema,
} from '../audit/voc.js';

export const AUDIT_EVENT_TYPES = [
  'permission_requested',
  // Slice 2 #10: Managed System Registry write path (ADR-0017 audit detail).
  'managed_system_registered',
  'managed_system_updated',
  'managed_system_archived',
  // Slice 2 #11: Analytics Area write path + cascade tracking.
  'analytics_area_registered',
  'analytics_area_updated',
  'analytics_area_archived',
  // Slice 3 #12: VOC domain events (ADR-0017 audit detail).
  'voc_created',
  'voc_triage_committed',
  'voc_severity_set',
  'voc_owner_assigned',
  'voc_analytics_area_linked',
  'voc_cluster_decision_recorded',
  'public_update_created',
  'reporter_facing_status_changed',
  'reporter_reply_created',
  'internal_comment_created',
  // Slice 3 #14: 보류 path audit event.
  'voc_triage_postponed',
  // Slice 3 #17: Reporter pre-triage description edit.
  'voc_description_edited',
  // Slice 3 #22 / PLAN-22 C3a: attachment upload commit.
  'attachment_uploaded',
  // Slice 4.1 #112: canonical entity link creation tracer.
  'entity_link.created',
  // Slice 4.2 #113: audited soft detach lifecycle.
  'entity_link.detached',
] as const;
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export const auditEventTypeSchema = z.enum(AUDIT_EVENT_TYPES);

// `permission_requested` detail shape — locked by issue #5 application
// service step 3. Optional fields are explicitly nullable so the audit row
// faithfully records what the request did or did not carry.
// `sensitive` is true when the requested capability is marked sensitive in
// CAPABILITY_META (per policy doc 05-permission-policy.md:62-76).
export const permissionRequestedDetailSchema = z.object({
  capability: z.string().min(1),
  managed_system_id: z.string().uuid().nullable(),
  reason: z.string().min(1),
  sensitive: z.boolean(),
  source_object_type: z.string().nullable(),
  source_object_id: z.string().uuid().nullable(),
  source_action_id: z.string().nullable(),
});
export type PermissionRequestedDetail = z.infer<typeof permissionRequestedDetailSchema>;

// ──────────────────────────────────────────────────────────────────────
// Managed System Registry audit events (ADR-0017 audit-detail section).
// `_registered` snapshots row state at creation; `_updated` records a
// change diff (`changes: { field: { from, to } }`); `_archived` records
// the id list of cascaded Analytics Areas (empty until Slice 2 #11
// activates the AA write path).
// ──────────────────────────────────────────────────────────────────────
export const managedSystemRegisteredDetailSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  external_key: z.string().nullable(),
  default_owner_actor_id: z.string().uuid().nullable(),
  default_owner_team_id: z.string().uuid().nullable(),
});
export type ManagedSystemRegisteredDetail = z.infer<typeof managedSystemRegisteredDetailSchema>;

// `changes` is a map of field → { from, to }; values are JSON-compatible.
// At least one field is present — a PATCH that changes nothing returns 200
// without writing an audit row, so this schema rejects an empty `changes`.
const changeEntrySchema = z.object({
  from: z.union([z.string(), z.null()]),
  to: z.union([z.string(), z.null()]),
});
export const managedSystemUpdatedDetailSchema = z.object({
  managed_system_id: z.string().uuid(),
  changes: z.record(z.string(), changeEntrySchema).refine((c) => Object.keys(c).length > 0, {
    message: 'changes must include at least one field',
  }),
});
export type ManagedSystemUpdatedDetail = z.infer<typeof managedSystemUpdatedDetailSchema>;

export const managedSystemArchivedDetailSchema = z.object({
  managed_system_id: z.string().uuid(),
  cascaded_analytics_area_ids: z.array(z.string().uuid()),
});
export type ManagedSystemArchivedDetail = z.infer<typeof managedSystemArchivedDetailSchema>;

// ──────────────────────────────────────────────────────────────────────
// Analytics Area audit events (ADR-0017 audit-detail section, Slice 2 #11).
// `_archived` carries `cascade_source_managed_system_id` so a single BI
// query can join from either direction (MS archive → child AAs, or AA
// row → parent cascade event).
// ──────────────────────────────────────────────────────────────────────
export const analyticsAreaRegisteredDetailSchema = z.object({
  workspace_id: z.string().uuid(),
  managed_system_id: z.string().uuid(),
  slug: z.string().min(1),
  name: z.string().min(1),
  owner_team_id: z.string().uuid().nullable(),
});
export type AnalyticsAreaRegisteredDetail = z.infer<typeof analyticsAreaRegisteredDetailSchema>;

export const analyticsAreaUpdatedDetailSchema = z.object({
  analytics_area_id: z.string().uuid(),
  changes: z.record(z.string(), changeEntrySchema).refine((c) => Object.keys(c).length > 0, {
    message: 'changes must include at least one field',
  }),
});
export type AnalyticsAreaUpdatedDetail = z.infer<typeof analyticsAreaUpdatedDetailSchema>;

export const analyticsAreaArchivedDetailSchema = z.object({
  analytics_area_id: z.string().uuid(),
  cascade_source_managed_system_id: z.string().uuid().nullable(),
});
export type AnalyticsAreaArchivedDetail = z.infer<typeof analyticsAreaArchivedDetailSchema>;

export const entityLinkCreatedDetailSchema = z.object({
  link_id: z.string().uuid(),
  source: z.object({
    type: z.literal('voc'),
    id: z.string().uuid(),
  }),
  target: z.object({
    type: z.literal('voc'),
    id: z.string().uuid(),
  }),
  relation_type: z.literal('related_to'),
  visibility: z.literal('internal_only'),
});
export type EntityLinkCreatedDetail = z.infer<typeof entityLinkCreatedDetailSchema>;

export const entityLinkDetachedDetailSchema = z.object({
  link_id: z.string().uuid(),
  source: z.object({
    type: z.literal('voc'),
    id: z.string().uuid(),
  }),
  target: z.object({
    type: z.literal('voc'),
    id: z.string().uuid(),
  }),
  relation_type: z.literal('related_to'),
  reason: z.string().min(1),
});
export type EntityLinkDetachedDetail = z.infer<typeof entityLinkDetachedDetailSchema>;

export const AUDIT_EVENT_DETAIL_SCHEMAS = {
  permission_requested: permissionRequestedDetailSchema,
  managed_system_registered: managedSystemRegisteredDetailSchema,
  managed_system_updated: managedSystemUpdatedDetailSchema,
  managed_system_archived: managedSystemArchivedDetailSchema,
  analytics_area_registered: analyticsAreaRegisteredDetailSchema,
  analytics_area_updated: analyticsAreaUpdatedDetailSchema,
  analytics_area_archived: analyticsAreaArchivedDetailSchema,
  // Slice 3 #12: VOC domain events.
  voc_created: vocCreatedDetailSchema,
  voc_triage_committed: vocTriageCommittedDetailSchema,
  voc_severity_set: vocSeveritySetDetailSchema,
  voc_owner_assigned: vocOwnerAssignedDetailSchema,
  voc_analytics_area_linked: vocAnalyticsAreaLinkedDetailSchema,
  voc_cluster_decision_recorded: vocClusterDecisionRecordedDetailSchema,
  public_update_created: publicUpdateCreatedDetailSchema,
  reporter_facing_status_changed: reporterFacingStatusChangedDetailSchema,
  reporter_reply_created: reporterReplyCreatedDetailSchema,
  internal_comment_created: internalCommentCreatedDetailSchema,
  // Slice 3 #14: 보류 path audit event.
  voc_triage_postponed: vocTriagePostponedDetailSchema,
  // Slice 3 #17: Reporter pre-triage description edit.
  voc_description_edited: vocDescriptionEditedDetailSchema,
  // Slice 3 #22 / PLAN-22 C3a: attachment upload commit.
  attachment_uploaded: attachmentUploadedDetailSchema,
  // Slice 4.1 #112.
  'entity_link.created': entityLinkCreatedDetailSchema,
  // Slice 4.2 #113.
  'entity_link.detached': entityLinkDetachedDetailSchema,
} as const satisfies Record<AuditEventType, z.ZodTypeAny>;
