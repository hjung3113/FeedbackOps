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
  voc_id: uuid(),
  workspace_id: uuid(),
  primary_managed_system_id: uuid(),
  analytics_area_id: uuid().nullable(),
  reporter_id: uuid(),
  source_context: sourceContextSchema,
});
export type VocCreatedDetail = z.infer<typeof vocCreatedDetailSchema>;

// ── voc_triage_committed ───────────────────────────────────────────────────
// severity is nullable: the dismissal path (triage_state='dismissed_not_actionable')
// commits triage without assigning severity. The `triaged` path always sets it.
// owner_user_id, owner_team_id, analytics_area_id, and cluster_decision
// may still be null if not yet determined at commit time.
export const vocTriageCommittedDetailSchema = z.object({
  voc_id: uuid(),
  severity: severitySchema.nullable(),
  owner_user_id: uuid().nullable(),
  owner_team_id: uuid().nullable(),
  analytics_area_id: uuid().nullable(),
  cluster_decision: z.enum(['confirm', 'dismiss']).nullable(),
});
export type VocTriageCommittedDetail = z.infer<typeof vocTriageCommittedDetailSchema>;

// ── voc_severity_set ───────────────────────────────────────────────────────
// `to` is nullable to support the severity-clear ("de-triage") path where
// severity is explicitly set back to null. The refine still enforces an
// actual change (from !== to).
export const vocSeveritySetDetailSchema = z
  .object({
    voc_id: uuid(),
    from: severitySchema.nullable(),
    to: severitySchema.nullable(),
  })
  .refine((d) => d.from !== d.to, { message: 'severity_set must record an actual change' });
export type VocSeveritySetDetail = z.infer<typeof vocSeveritySetDetailSchema>;

// ── voc_owner_assigned ─────────────────────────────────────────────────────
const ownerRefSchema = z
  .object({
    user_id: uuid().nullable(),
    team_id: uuid().nullable(),
  })
  .refine(
    (r) => !(r.user_id && r.team_id),
    { message: 'owner XOR: user_id and team_id cannot both be set' },
  );

export const vocOwnerAssignedDetailSchema = z
  .object({
    voc_id: uuid(),
    from: ownerRefSchema,
    to: ownerRefSchema,
  })
  .refine(
    (d) => !(d.from.user_id === d.to.user_id && d.from.team_id === d.to.team_id),
    { message: 'owner assignment must change at least one of user_id / team_id' },
  );
export type VocOwnerAssignedDetail = z.infer<typeof vocOwnerAssignedDetailSchema>;

// ── voc_analytics_area_linked ──────────────────────────────────────────────
export const vocAnalyticsAreaLinkedDetailSchema = z
  .object({
    voc_id: uuid(),
    from: uuid().nullable(),
    to: uuid().nullable(),
  })
  .refine((d) => d.from !== d.to, { message: 'analytics_area_linked must record an actual change' });
export type VocAnalyticsAreaLinkedDetail = z.infer<typeof vocAnalyticsAreaLinkedDetailSchema>;

// ── voc_cluster_decision_recorded ─────────────────────────────────────────
export const vocClusterDecisionRecordedDetailSchema = z.object({
  voc_id: uuid(),
  decision: z.enum(['confirm', 'dismiss']),
});
export type VocClusterDecisionRecordedDetail = z.infer<
  typeof vocClusterDecisionRecordedDetailSchema
>;

// ── public_update_created ──────────────────────────────────────────────────
// When skip_public_update=true, skip_reason must be at least 8 chars.
export const publicUpdateCreatedDetailSchema = z
  .object({
    voc_id: uuid(),
    public_update_id: uuid(),
    actor_id: uuid(),
    skip_public_update: z.boolean(),
    skip_reason: z.string().nullable(),
  })
  .refine(
    (d) => d.skip_public_update
      ? typeof d.skip_reason === 'string' && d.skip_reason.trim().length >= 8
      : d.skip_reason === null,
    { message: 'skip_reason must be null when skip=false, >=8 trimmed chars when skip=true' },
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
  reporter_reply_id: uuid(),
  actor_id: uuid(),
});
export type ReporterReplyCreatedDetail = z.infer<typeof reporterReplyCreatedDetailSchema>;

// ── internal_comment_created ───────────────────────────────────────────────
export const internalCommentCreatedDetailSchema = z.object({
  voc_id: uuid(),
  internal_comment_id: uuid(),
  actor_id: uuid(),
  mentions: z.array(uuid()),
});
export type InternalCommentCreatedDetail = z.infer<typeof internalCommentCreatedDetailSchema>;

// ── voc_triage_postponed ───────────────────────────────────────────────────
// Emitted when `postpone_review: true` is sent in PATCH /vocs/:id (Slice 3
// #14). triage_state remains 'untriaged'; `triage_state_review_postponed_at`
// is set to now(). No `postponed_until` in Slice 3 (deferred scheduling).
export const vocTriagePostponedDetailSchema = z.object({
  voc_id: uuid(),
  actor_id: uuid(),
});
export type VocTriagePostponedDetail = z.infer<typeof vocTriagePostponedDetailSchema>;
