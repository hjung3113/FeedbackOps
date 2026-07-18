import { z } from 'zod';

export * from './decisions.js';

// State vocabulary per docs/frontend/specs/voc.md §4.2 (PermissionDecisionState).
// Envelope appears ONLY for blocked states — 'allow' has no envelope; an
// unblocked entity simply omits the key.
//   request_access         — actor may request the missing scope (CTA shown)
//   summary_visible        — safe summary returned, full content hidden
//   denied                 — explicit deny (permission_denies row); no CTA
//   blocked_not_requestable — structural restriction; actor must not learn
//                            they could request access
export const PERMISSION_DECISION_STATES = [
  'request_access',
  'summary_visible',
  'denied',
  'blocked_not_requestable',
] as const;
export type PermissionDecisionState = (typeof PERMISSION_DECISION_STATES)[number];

// `summary` is a SafeSummary; the precise shape lives outside this module
// (voc.md §4.2 references it but the type is owned by the permission policy
// doc). Until that schema lands, accept any JSON-compatible payload and
// constrain it in a follow-up. nullable() because it is only populated when
// state === 'summary_visible'.
const safeSummarySchema = z.unknown().nullable();

export const permissionDecisionSchema = z.object({
  decision_id: z.string().uuid(),
  state: z.enum(PERMISSION_DECISION_STATES),
  category: z.string().min(1),
  reason: z.string().min(1).optional(),
  required_scope: z.array(z.string().min(1)).optional(),
  summary: safeSummarySchema.optional(),
  // UTC-only per ADR-0015; rejects any explicit numeric offset
  // (`+09:00`, `-05:00`) and bare offsetless strings. Accepts only the `Z` suffix.
  evaluated_at: z.string().datetime({ offset: false }),
});
export type PermissionDecision = z.infer<typeof permissionDecisionSchema>;

// Envelope: keys are decision purposes (linkedFinding, linkedTask, ...).
// Values must match permissionDecisionSchema; unknown-shaped values are rejected.
export const permissionDecisionsEnvelopeSchema = z.record(z.string(), permissionDecisionSchema);
export type PermissionDecisionsEnvelope = Record<string, PermissionDecision>;
