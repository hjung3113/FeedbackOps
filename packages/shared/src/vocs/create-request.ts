import { z } from 'zod';

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

// Slice 3 #22 will define this fully; the create-request only needs a stub.
export const attachmentRefSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  size_bytes: z.number().int().nonnegative(),
  mime_type: z.string().min(1),
  storage_uri: z.string().min(1),
});
export type AttachmentRef = z.infer<typeof attachmentRefSchema>;

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
  title: z.string().min(1).max(200),
  description_rich_content: tipTapDocSchema,
  analytics_area_id: z.string().uuid().optional(),
  source_context: sourceContextSchema.default('direct_use'),
  attachments: z.array(attachmentRefSchema).optional(),
});
export type CreateVocRequest = z.infer<typeof createVocRequestSchema>;
