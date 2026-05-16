// Audit event vocabulary. The canonical verb list is locked verbatim by
// docs/implementation/05-permission-policy.md:146-156 (snake_case, single
// token, no dot — e.g. `permission_requested`, `permission_approved`).
// ADR-0008's older `subject_type.verb` convention is a non-binding stylistic
// suggestion and explicitly defers to the policy doc's verb vocabulary for
// any event listed there. New events MUST take their name from that list,
// or — if no policy-doc entry exists — adopt the same snake_case style.
//
// Both apps import the canonical list from `@fops/shared`. Slice 1 (#5)
// ships exactly one event: `permission_requested`.
//
// New events MUST add (a) the event_type string to AUDIT_EVENT_TYPES and (b)
// a zod schema for the `detail` payload in AUDIT_EVENT_DETAIL_SCHEMAS so the
// audit service can validate the call site at write time.

import { z } from 'zod';

export const AUDIT_EVENT_TYPES = ['permission_requested'] as const;
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export const auditEventTypeSchema = z.enum(AUDIT_EVENT_TYPES);

// `permission_requested` detail shape — locked by issue #5 application
// service step 3. Optional fields are explicitly nullable so the audit row
// faithfully records what the request did or did not carry.
// `sensitive` is true when the requested capability is marked sensitive in
// CAPABILITY_META (per policy doc 05-permission-policy.md:62-76).
export const permissionRequestedDetailSchema = z.object({
  capability: z.string().min(1),
  managed_system_id: z.string().uuid().nullable(),
  reason: z.string().min(1),
  sensitive: z.boolean(),
  source_object_type: z.string().nullable(),
  source_object_id: z.string().uuid().nullable(),
  source_action_id: z.string().nullable(),
});
export type PermissionRequestedDetail = z.infer<typeof permissionRequestedDetailSchema>;

export const AUDIT_EVENT_DETAIL_SCHEMAS = {
  permission_requested: permissionRequestedDetailSchema,
} as const satisfies Record<AuditEventType, z.ZodTypeAny>;
