import { z } from 'zod';

// Severity and triage-state enums are defined here (not re-imported from
// patch-request) because list-item is a READ schema; patch-request is a WRITE
// schema. Both declare the same underlying enum values intentionally —
// there is no shared enum file yet, and adding one is deferred per ADR.
export const severityEnumSchema = z.enum(['low', 'medium', 'high', 'critical']);
export type SeverityEnum = z.infer<typeof severityEnumSchema>;

export const triageStateEnumSchema = z.enum([
  'untriaged',
  'triaged',
  'needs_more_information',
  'dismissed_not_actionable',
]);
export type TriageStateEnum = z.infer<typeof triageStateEnumSchema>;

export const reporterFacingStatusEnumSchema = z.enum([
  'received',
  'reviewing',
  'assigned',
  'progress',
  'prep',
  'resolved',
  'reopened',
  'closed',
]);
export type ReporterFacingStatusEnum = z.infer<typeof reporterFacingStatusEnumSchema>;

export const sourceContextEnumSchema = z.enum([
  'direct_use',
  'proxy_report',
  'operational_discovery',
  'stakeholder_request',
]);
export type SourceContextEnum = z.infer<typeof sourceContextEnumSchema>;

export const vocListItemSchema = z.object({
  id: z.string().uuid(),
  display_id: z.string(),
  title: z.string(),
  primary_managed_system_id: z.string().uuid(),
  analytics_area_id: z.string().uuid().nullable(),
  reporter_id: z.string().uuid(),
  owner_user_id: z.string().uuid().nullable(),
  owner_team_id: z.string().uuid().nullable(),
  severity: severityEnumSchema.nullable(),
  reporter_facing_status: reporterFacingStatusEnumSchema,
  triage_state: triageStateEnumSchema,
  source_context: sourceContextEnumSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  // Authorized, active same-Managed-System peers; see ADR-0031.
  similar_count: z.number().int().min(0),
  // PLAN-22 §Bug-1 (2026-05-22): count of active (non-archived) attachments
  // linked to this VOC. Computed via subquery in listVocs to keep the row
  // shape flat — FE renders a paperclip + count chip in the inbox without
  // having to JOIN the attachment list per row.
  attachment_count: z.number().int().min(0),
});
export type VocListItem = z.infer<typeof vocListItemSchema>;
