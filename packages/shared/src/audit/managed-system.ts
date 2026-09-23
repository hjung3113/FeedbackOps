// Managed System Registry audit detail schemas (ADR-0017 audit-detail
// section). `_registered` snapshots row state at creation; `_updated`
// records a change diff (`changes: { field: { from, to } }`); `_archived`
// records the id list of cascaded Analytics Areas (empty until Slice 2 #11
// activates the AA write path). Imported by audit-events.ts to register
// into AUDIT_EVENT_DETAIL_SCHEMAS.

import { z } from 'zod';

export const MANAGED_SYSTEM_AUDIT_EVENT_TYPES = [
  'managed_system_registered',
  'managed_system_updated',
  'managed_system_archived',
] as const;

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

export const MANAGED_SYSTEM_AUDIT_EVENT_DETAIL_SCHEMAS = {
  managed_system_registered: managedSystemRegisteredDetailSchema,
  managed_system_updated: managedSystemUpdatedDetailSchema,
  managed_system_archived: managedSystemArchivedDetailSchema,
} as const satisfies Record<(typeof MANAGED_SYSTEM_AUDIT_EVENT_TYPES)[number], z.ZodTypeAny>;
