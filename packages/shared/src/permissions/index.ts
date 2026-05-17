import { z } from 'zod';

// State vocabulary per docs/frontend/specs/voc.md §4.2 + 05-permission-policy.md.
// `allow`        — full read/write per capability grant.
// `summary_visible` — restricted finding within the same Managed System;
//                   reporter or stakeholder may see redacted summary only.
// `deny`         — explicit deny (permission_denies row).
// `request_access` — actor outside scope; UI surfaces a request-access CTA.
export const PERMISSION_DECISION_STATES = [
  'allow',
  'summary_visible',
  'deny',
  'request_access',
] as const;
export type PermissionDecisionState = (typeof PERMISSION_DECISION_STATES)[number];

export const permissionDecisionSchema = z.object({
  decision_id: z.string().uuid(),
  state: z.enum(PERMISSION_DECISION_STATES),
  evaluated_at: z.string().datetime(),
  reason: z.string().min(1),
});
export type PermissionDecision = z.infer<typeof permissionDecisionSchema>;

// Envelope: keys are decision purposes (`linkedFinding`, `linkedTask`, …).
// Slice 3 VOC consumes `linkedFinding`. Other keys may land additively
// without schema migration; unknown keys are preserved.
export const permissionDecisionsEnvelopeSchema = z.record(z.string(), permissionDecisionSchema);
export type PermissionDecisionsEnvelope = Record<string, PermissionDecision>;
