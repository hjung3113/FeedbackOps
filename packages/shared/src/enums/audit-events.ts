// Audit event vocabulary. ADR-0008:53 mandates that every event_type is
// drawn from a closed list and named `subject_type.verb`. The canonical list
// lives here; both apps import from `@fops/shared`. Slice 1 (#5) ships
// exactly one event: `permission.requested`.
//
// New events MUST add (a) the event_type string to AUDIT_EVENT_TYPES and (b)
// a zod schema for the `detail` payload in AUDIT_EVENT_DETAIL_SCHEMAS so the
// audit service can validate the call site at write time.

import { z } from 'zod';

export const AUDIT_EVENT_TYPES = ['permission.requested'] as const;
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export const auditEventTypeSchema = z.enum(AUDIT_EVENT_TYPES);

// `permission.requested` detail shape — locked by issue #5 application
// service step 3. Optional fields are explicitly nullable so the audit row
// faithfully records what the request did or did not carry.
export const permissionRequestedDetailSchema = z.object({
  capability: z.string().min(1),
  managed_system_id: z.string().uuid().nullable(),
  reason: z.string().min(1),
  source_object_type: z.string().nullable(),
  source_object_id: z.string().uuid().nullable(),
  source_action_id: z.string().nullable(),
});
export type PermissionRequestedDetail = z.infer<typeof permissionRequestedDetailSchema>;

export const AUDIT_EVENT_DETAIL_SCHEMAS = {
  'permission.requested': permissionRequestedDetailSchema,
} as const satisfies Record<AuditEventType, z.ZodTypeAny>;
