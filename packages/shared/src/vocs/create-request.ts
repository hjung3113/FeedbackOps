import { z } from 'zod';

import { isTipTapDocBlank } from './rich-content.js';

export const SOURCE_CONTEXTS = [
  'direct_use',
  'proxy_report',
  'operational_discovery',
  'stakeholder_request',
] as const;
export const sourceContextSchema = z.enum(SOURCE_CONTEXTS);
export type SourceContext = z.infer<typeof sourceContextSchema>;

// TipTap doc — opaque jsonb at the wire boundary; sanitizer in apps/backend
// validates structure. Keep loose here to avoid duplicating the surface
// allowlists across packages.
export const tipTapDocSchema = z.object({
  type: z.literal('doc'),
  content: z.array(z.unknown()).optional(),
});
export type TipTapDoc = z.infer<typeof tipTapDocSchema>;

export function emptyTipTapDoc(): TipTapDoc {
  return { type: 'doc', content: [] };
}

// PLAN-22 C7b: `AttachmentRef` retained for audit replay
// (`voc_description_edited.detail.changes.attachments: { from, to }`).
// Wire-in request schemas no longer accept `attachments: AttachmentRef[]` —
// they accept `attachment_ids: string[]` referencing pre-uploaded
// voc.voc_attachments rows (PLAN-22 C3b).
export const attachmentRefSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  size_bytes: z.number().int().nonnegative(),
  mime_type: z.string().min(1),
  storage_uri: z.string().min(1),
});
export type AttachmentRef = z.infer<typeof attachmentRefSchema>;

// PLAN-22 C7b: shared wire shape for "link these pre-uploaded attachments to
// this VOC / comment". Max 10 per parent (voc.md §4.4 dropzone constraint).
export const MAX_ATTACHMENT_IDS_PER_PARENT = 10;
export const attachmentIdsSchema = z
  .array(z.string().uuid())
  .max(MAX_ATTACHMENT_IDS_PER_PARENT);

export const FORBIDDEN_CREATE_FIELDS = [
  'reporter_id',
  'severity',
  'reporter_facing_status',
  'triage_state',
  'owner_user_id',
  'owner_team_id',
  'display_id',
] as const;
export type ForbiddenCreateField = (typeof FORBIDDEN_CREATE_FIELDS)[number];

export const createVocRequestSchema = z.object({
  primary_managed_system_id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  // Korean because `VocCreateScreen` renders this message verbatim under the
  // editor. The schema's other messages are still zod's English defaults —
  // pre-existing, and not something this change should widen into.
  description_rich_content: tipTapDocSchema.refine((doc) => !isTipTapDocBlank(doc), {
    message: '상세 설명을 입력해 주세요.',
  }),
  analytics_area_id: z.string().uuid().optional(),
  source_context: sourceContextSchema.default('direct_use'),
  attachment_ids: attachmentIdsSchema.optional(),
});
export type CreateVocRequest = z.infer<typeof createVocRequestSchema>;
