import { z } from 'zod';

import type { ErrorCode } from '../errors/codes.js';
import { attachmentIdsSchema, tipTapDocSchema } from './create-request.js';

// ── editDescriptionRequestSchema ───────────────────────────────────────────
// Used by PATCH /vocs/:id/description (Slice 3 #17). Strict so that any
// field outside the allowlist is rejected as `unrecognized_keys` by Zod —
// the schema's `.strict()` is the security boundary, not the forbidden-field
// pre-check below. The pre-check exists only for UX precision on known named
// server fields.
//
// PLAN-22 C7b: wire shape carries `attachment_ids: string[]` referencing
// pre-uploaded voc_attachments rows. Audit replay shape
// (`changes.attachments: { from: AttachmentRef[], to: AttachmentRef[] }`)
// is unchanged — service layer resolves linked rows back to AttachmentRef[]
// before recording the audit event.
export const editDescriptionRequestSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description_rich_content: tipTapDocSchema.optional(),
    attachment_ids: attachmentIdsSchema.optional(),
  })
  .strict()
  .refine(
    (o) => Object.keys(o).length > 0,
    { message: 'at least one field required' },
  );

export type EditDescriptionRequest = z.infer<typeof editDescriptionRequestSchema>;

// ── FORBIDDEN_EDIT_DESCRIPTION_FIELDS ─────────────────────────────────────
// UX-only: known server-managed fields that a reporter might accidentally
// send. Each maps to `validation.unexpected_field` so the response carries
// a precise per-field path. `.strict()` catches anything else not on this
// list as generic `validation.failed` with Zod `unrecognized_keys`.
export const FORBIDDEN_EDIT_DESCRIPTION_FIELDS = [
  'severity',
  'owner_user_id',
  'owner_team_id',
  'analytics_area_id',
  'triage_state',
  'cluster_decision',
  'reporter_facing_status',
  'source_context',
  'primary_managed_system_id',
  'reporter_id',
  'archived_at',
  'workspace_id',
  'display_id',
  'id',
  'created_at',
  'updated_at',
] as const;

export type ForbiddenEditDescriptionField =
  (typeof FORBIDDEN_EDIT_DESCRIPTION_FIELDS)[number];

export const FORBIDDEN_EDIT_DESCRIPTION_FIELD_ERROR_CODES: Readonly<
  Record<ForbiddenEditDescriptionField, ErrorCode>
> = {
  severity: 'validation.unexpected_field',
  owner_user_id: 'validation.unexpected_field',
  owner_team_id: 'validation.unexpected_field',
  analytics_area_id: 'validation.unexpected_field',
  triage_state: 'validation.unexpected_field',
  cluster_decision: 'validation.unexpected_field',
  reporter_facing_status: 'validation.unexpected_field',
  source_context: 'validation.unexpected_field',
  primary_managed_system_id: 'validation.unexpected_field',
  reporter_id: 'validation.unexpected_field',
  archived_at: 'validation.unexpected_field',
  workspace_id: 'validation.unexpected_field',
  display_id: 'validation.unexpected_field',
  id: 'validation.unexpected_field',
  created_at: 'validation.unexpected_field',
  updated_at: 'validation.unexpected_field',
};
