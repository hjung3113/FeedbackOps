// Analytics Area audit detail schemas (ADR-0017 audit-detail section,
// Slice 2 #11). `_archived` carries `cascade_source_managed_system_id` so a
// single BI query can join from either direction (MS archive → child AAs,
// or AA row → parent cascade event). Imported by audit-events.ts to
// register into AUDIT_EVENT_DETAIL_SCHEMAS.

import { z } from 'zod';

export const ANALYTICS_AREA_AUDIT_EVENT_TYPES = [
  'analytics_area_registered',
  'analytics_area_updated',
  'analytics_area_archived',
] as const;

export const analyticsAreaRegisteredDetailSchema = z.object({
  workspace_id: z.string().uuid(),
  managed_system_id: z.string().uuid(),
  slug: z.string().min(1),
  name: z.string().min(1),
  owner_team_id: z.string().uuid().nullable(),
});
export type AnalyticsAreaRegisteredDetail = z.infer<typeof analyticsAreaRegisteredDetailSchema>;

// `changes` shares the managed-system change-diff shape; the private
// `changeEntrySchema` helper is duplicated here on purpose (a four-line
// object — not worth coupling the two domains over).
const changeEntrySchema = z.object({
  from: z.union([z.string(), z.null()]),
  to: z.union([z.string(), z.null()]),
});
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

export const ANALYTICS_AREA_AUDIT_EVENT_DETAIL_SCHEMAS = {
  analytics_area_registered: analyticsAreaRegisteredDetailSchema,
  analytics_area_updated: analyticsAreaUpdatedDetailSchema,
  analytics_area_archived: analyticsAreaArchivedDetailSchema,
} as const satisfies Record<(typeof ANALYTICS_AREA_AUDIT_EVENT_TYPES)[number], z.ZodTypeAny>;
