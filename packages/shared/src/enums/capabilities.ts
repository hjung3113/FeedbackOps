// Capability vocabulary for the Permission module.
//
// Naming: `{module}.{action}` — keep names module-prefixed so the registry
// remains scannable and the permission UI can group by module.
//
// Sensitive marker: certain capabilities require a reason on request per
// docs/implementation/05-permission-policy.md:62-76 ("Sensitive Permissions").
// `workspace.admin` is the concrete Slice 1 implementation of the policy
// doc's "Admin permission" entry and is therefore Sensitive — a request for
// it must carry a non-empty reason and the audit detail must mark it
// `sensitive: true`. See F-014 in `.review/SLICE-1-REVIEW.md`.

export const CAPABILITIES = [
  'workspace.read',
  'workspace.admin',
  'voc.triage',
  'voc.read',
  'finding.read',
  'finding.manage',
  'task_request.self_approve',
  'survey.read',
  'survey.manage',
  'survey.read_personal_responses',
  'survey.export',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/**
 * How the workspace-admin role is satisfied *above* the generic
 * `roleSatisfies` layer in `modules/permissions/check-service.ts`.
 *
 * `roleSatisfies` only covers the Slice 1 role-derived set (`workspace.read`,
 * `workspace.admin`, `voc.triage`, `voc.read`). Several domain modules layer an
 * additional admin bypass on top of it, and those bypasses are part of the
 * access contract — not local shortcuts. This field is the single declaration
 * of that layering so the advisory `GET /me/permissions/check` decision cannot
 * drift from what the enforcing route will actually do (issue #372).
 *
 * - `none` — admin gets nothing beyond `roleSatisfies` for this capability.
 * - `unless_denied` — admin is allowed unless an explicit deny applies; the
 *   module runs the scoped check first and returns it when the reason is
 *   `explicit_deny`. See `modules/surveys/authorization.ts`.
 * - `always` — the module short-circuits on `role_level === 'admin'` before
 *   consulting Permission at all. See `modules/findings/authorization.ts` and
 *   `modules/task-requests/service.ts`.
 */
export type AdminModuleBypass = 'none' | 'unless_denied' | 'always';

export interface CapabilityMeta {
  /** When true, permission_requests must include a non-empty reason. */
  sensitive: boolean;
  /** Admin-role satisfaction layered above `roleSatisfies`. */
  adminModuleBypass: AdminModuleBypass;
}

/**
 * Authoritative per-capability metadata. The shape is intentionally an object
 * (not a Set/list of sensitive caps) so future entries can carry additional
 * fields — display labels, default expiry policy, audit hooks — without
 * another rename.
 */
export const CAPABILITY_META: Readonly<Record<Capability, CapabilityMeta>> = {
  // The four role-derived Slice 1 capabilities are satisfied by `roleSatisfies`
  // itself, so no module layers anything on top: `adminModuleBypass: 'none'`.
  'workspace.read': { sensitive: false, adminModuleBypass: 'none' },
  'workspace.admin': { sensitive: true, adminModuleBypass: 'none' },
  // voc.triage: NOT sensitive — Developers may request it for a specific MS.
  'voc.triage': { sensitive: false, adminModuleBypass: 'none' },
  // voc.read: NOT sensitive — Developers may request it for a specific MS to view VOCs.
  'voc.read': { sensitive: false, adminModuleBypass: 'none' },
  // Finding point authorization short-circuits on the admin role before
  // consulting Permission (`modules/findings/authorization.ts`).
  'finding.read': { sensitive: false, adminModuleBypass: 'always' },
  'finding.manage': { sensitive: false, adminModuleBypass: 'always' },
  // Self-approval is sensitive because it bypasses normal reviewer separation.
  // `hasSelfApprovalCapability` still short-circuits on the admin role.
  'task_request.self_approve': { sensitive: true, adminModuleBypass: 'always' },
  // survey.read: NOT sensitive — Developers may request scoped read access for a Managed System.
  // ADR-0033 §C: Admin may bypass, but an explicit deny still wins.
  'survey.read': { sensitive: false, adminModuleBypass: 'unless_denied' },
  // Survey creation and management are sensitive actions for a Managed System.
  // ADR-0033 §C: same Admin bypass as survey.read, explicit deny dominant.
  'survey.manage': { sensitive: true, adminModuleBypass: 'unless_denied' },
  // Workspace Admin does not bypass this by role alone; explicit permission is required.
  // See docs/design/07-survey-system.md and ADR-0033 §C ("no role bypass, including Admin").
  'survey.read_personal_responses': { sensitive: true, adminModuleBypass: 'none' },
  // Workspace Admin does not bypass this by role alone; explicit permission is required.
  // See docs/design/07-survey-system.md and ADR-0033 §C ("no role bypass, including Admin").
  'survey.export': { sensitive: true, adminModuleBypass: 'none' },
};

export function isCapability(value: string): value is Capability {
  return (CAPABILITIES as readonly string[]).includes(value);
}

export function isSensitiveCapability(cap: Capability): boolean {
  return CAPABILITY_META[cap].sensitive;
}

export function adminModuleBypassFor(cap: Capability): AdminModuleBypass {
  return CAPABILITY_META[cap].adminModuleBypass;
}
