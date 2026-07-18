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

export interface CapabilityMeta {
  /** When true, permission_requests must include a non-empty reason. */
  sensitive: boolean;
}

/**
 * Authoritative per-capability metadata. The shape is intentionally an object
 * (not a Set/list of sensitive caps) so future entries can carry additional
 * fields — display labels, default expiry policy, audit hooks — without
 * another rename.
 */
export const CAPABILITY_META: Readonly<Record<Capability, CapabilityMeta>> = {
  'workspace.read': { sensitive: false },
  'workspace.admin': { sensitive: true },
  // voc.triage: NOT sensitive — Developers may request it for a specific MS.
  'voc.triage': { sensitive: false },
  // voc.read: NOT sensitive — Developers may request it for a specific MS to view VOCs.
  'voc.read': { sensitive: false },
  'finding.read': { sensitive: false },
  'finding.manage': { sensitive: false },
  // Self-approval is sensitive because it bypasses normal reviewer separation.
  'task_request.self_approve': { sensitive: true },
  // survey.read: NOT sensitive — Developers may request scoped read access for a Managed System.
  'survey.read': { sensitive: false },
  // Survey creation and management are sensitive actions for a Managed System.
  'survey.manage': { sensitive: true },
  // Workspace Admin does not bypass this by role alone; explicit permission is required.
  // See docs/design/07-survey-system.md:230-232.
  'survey.read_personal_responses': { sensitive: true },
  // Workspace Admin does not bypass this by role alone; explicit permission is required.
  // See docs/design/07-survey-system.md:230-232.
  'survey.export': { sensitive: true },
};

export function isCapability(value: string): value is Capability {
  return (CAPABILITIES as readonly string[]).includes(value);
}

export function isSensitiveCapability(cap: Capability): boolean {
  return CAPABILITY_META[cap].sensitive;
}
