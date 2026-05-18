import { z } from 'zod';

import type { ErrorCode } from '../errors/codes.js';

const severitySchema = z.enum(['low', 'medium', 'high', 'critical']);
const triageStateSchema = z.enum([
  'untriaged',
  'triaged',
  'needs_more_information',
  'dismissed_not_actionable',
]);

// Fields that are forbidden on PATCH /vocs/:id. Each maps to a specific error
// code documented in the spec §8.4.
export const FORBIDDEN_PATCH_FIELDS = [
  // Must go through POST /vocs/:id/public-updates (S3-005).
  'reporter_facing_status',
  // Immutable server-resolved fields.
  'title',
  'description_rich_content',
  'display_id',
  'reporter_id',
  'workspace_id',
  'primary_managed_system_id',
  // Excluded from Slice 3 (Q5 resolved: cluster CRUD in Slice 3+).
  'cluster_decision',
] as const;
export type ForbiddenPatchField = (typeof FORBIDDEN_PATCH_FIELDS)[number];

// reporter_facing_status has a dedicated code; all other forbidden fields map
// to the generic unexpected-field code so the route can dispatch per-field.
export const FORBIDDEN_PATCH_FIELD_ERROR_CODES: Readonly<
  Record<ForbiddenPatchField, ErrorCode>
> = {
  reporter_facing_status: 'voc.reporter_status_via_public_update_only',
  title: 'validation.unexpected_field',
  description_rich_content: 'validation.unexpected_field',
  display_id: 'validation.unexpected_field',
  reporter_id: 'validation.unexpected_field',
  workspace_id: 'validation.unexpected_field',
  primary_managed_system_id: 'validation.unexpected_field',
  cluster_decision: 'validation.unexpected_field',
};

export const patchVocRequestSchema = z
  .object({
    severity: severitySchema.nullable().optional(),
    owner_user_id: z.string().uuid().nullable().optional(),
    owner_team_id: z.string().uuid().nullable().optional(),
    analytics_area_id: z.string().uuid().nullable().optional(),
    triage_state: triageStateSchema.optional(),
    postpone_review: z.boolean().optional(),
  })
  // Unknown keys are rejected so mistyped or unsupported fields surface
  // as `unrecognized_keys` rather than being silently stripped.
  .strict()
  // Owner XOR: both fields non-null simultaneously is invalid.
  .refine(
    (d) => !(d.owner_user_id != null && d.owner_team_id != null),
    {
      message: 'owner_user_id and owner_team_id are mutually exclusive',
      path: ['owner_team_id'],
    },
  )
  // postpone_review and triage_state are mutually exclusive.
  .refine(
    (d) => !(d.postpone_review === true && d.triage_state !== undefined),
    {
      message: 'postpone_review and triage_state cannot be set in the same request',
      path: ['postpone_review'],
    },
  );

export type PatchVocRequest = z.infer<typeof patchVocRequestSchema>;
