// VOC audit detail schemas (Slice 3 #12 — ADR-0017).
// Each schema describes the `detail` payload for one VOC domain event.
// Imported by audit-events.ts to register into AUDIT_EVENT_DETAIL_SCHEMAS.

import { z } from 'zod';

// ── Helpers ────────────────────────────────────────────────────────────────
const uuid = () => z.string().uuid();

const severitySchema = z.enum(['low', 'medium', 'high', 'critical']);

const reporterFacingStatusSchema = z.enum([
  'received',
  'reviewing',
  'assigned',
  'progress',
  'prep',
  'resolved',
  'reopened',
  'closed',
]);

const sourceContextSchema = z.enum([
  'direct_use',
  'proxy_report',
  'operational_discovery',
  'stakeholder_request',
]);

// ── voc_created ────────────────────────────────────────────────────────────
export const vocCreatedDetailSchema = z.object({
  workspace_id: uuid(),
  primary_managed_system_id: uuid(),
  analytics_area_id: uuid().nullable(),
  reporter_id: uuid(),
  source_context: sourceContextSchema,
});
export type VocCreatedDetail = z.infer<typeof vocCreatedDetailSchema>;

// ── voc_triage_committed ───────────────────────────────────────────────────
// severity is non-nullable — a triage commit requires a severity decision.
// owner_user_id, owner_team_id, analytics_area_id, and cluster_decision
// may still be null if not yet determined at commit time.
export const vocTriageCommittedDetailSchema = z.object({
  voc_id: uuid(),
  severity: severitySchema,
  owner_user_id: uuid().nullable(),
  owner_team_id: uuid().nullable(),
  analytics_area_id: uuid().nullable(),
  cluster_decision: z.enum(['confirm', 'dismiss']).nullable(),
});
export type VocTriageCommittedDetail = z.infer<typeof vocTriageCommittedDetailSchema>;

// ── voc_severity_set ───────────────────────────────────────────────────────
export const vocSeveritySetDetailSchema = z.object({
  voc_id: uuid(),
  from: severitySchema.nullable(),
  to: severitySchema,
});
export type VocSeveritySetDetail = z.infer<typeof vocSeveritySetDetailSchema>;

// ── voc_owner_assigned ─────────────────────────────────────────────────────
const ownerRefSchema = z.object({
  user_id: uuid().nullable(),
  team_id: uuid().nullable(),
});

export const vocOwnerAssignedDetailSchema = z.object({
  voc_id: uuid(),
  from: ownerRefSchema,
  to: ownerRefSchema,
});
export type VocOwnerAssignedDetail = z.infer<typeof vocOwnerAssignedDetailSchema>;

// ── voc_analytics_area_linked ──────────────────────────────────────────────
export const vocAnalyticsAreaLinkedDetailSchema = z.object({
  voc_id: uuid(),
  from: uuid().nullable(),
  to: uuid().nullable(),
});
export type VocAnalyticsAreaLinkedDetail = z.infer<typeof vocAnalyticsAreaLinkedDetailSchema>;

// ── voc_cluster_decision_recorded ─────────────────────────────────────────
export const vocClusterDecisionRecordedDetailSchema = z.object({
  voc_id: uuid(),
  decision: z.enum(['confirm', 'dismiss']),
  cluster_id: uuid().nullable(),
});
export type VocClusterDecisionRecordedDetail = z.infer<
  typeof vocClusterDecisionRecordedDetailSchema
>;

// ── public_update_created ──────────────────────────────────────────────────
// When skip_public_update=true, skip_reason must be at least 8 chars.
export const publicUpdateCreatedDetailSchema = z
  .object({
    voc_id: uuid(),
    public_update_id: uuid().nullable(),
    skip_public_update: z.boolean(),
    skip_reason: z.string().nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.skip_public_update) {
        return typeof data.skip_reason === 'string' && data.skip_reason.length >= 8;
      }
      return true;
    },
    { message: 'skip_reason must be a string with length >= 8 when skip_public_update is true' },
  );
export type PublicUpdateCreatedDetail = z.infer<typeof publicUpdateCreatedDetailSchema>;

// ── reporter_facing_status_changed ─────────────────────────────────────────
export const reporterFacingStatusChangedDetailSchema = z.object({
  voc_id: uuid(),
  from: reporterFacingStatusSchema,
  to: reporterFacingStatusSchema,
  paired_with: z.enum(['public_update', 'skip']),
});
export type ReporterFacingStatusChangedDetail = z.infer<
  typeof reporterFacingStatusChangedDetailSchema
>;

// ── reporter_reply_created ─────────────────────────────────────────────────
export const reporterReplyCreatedDetailSchema = z.object({
  voc_id: uuid(),
  reply_id: uuid(),
  author_id: uuid(),
});
export type ReporterReplyCreatedDetail = z.infer<typeof reporterReplyCreatedDetailSchema>;

// ── internal_comment_created ───────────────────────────────────────────────
export const internalCommentCreatedDetailSchema = z.object({
  voc_id: uuid(),
  comment_id: uuid(),
  author_id: uuid(),
  mentions: z.array(uuid()),
});
export type InternalCommentCreatedDetail = z.infer<typeof internalCommentCreatedDetailSchema>;
