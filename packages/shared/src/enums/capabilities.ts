// Capability vocabulary for the Permission module.
//
// Naming: `{module}.{action}` — keep names module-prefixed so the registry
// remains scannable and the permission UI can group by module.
//
// Sensitive marker: certain capabilities require a reason on request per
// docs/implementation/05-permission-policy.md:62-76 ("Sensitive Permissions").
// Slice 1 ships zero sensitive capabilities (`workspace.admin` is workspace-
// scoped administrative access but NOT in the sensitive list — see grill Q11
// and issue #4 locked decisions).
//
// TODO(S1.4 — permission requests): the sensitive marker mechanism is exposed
// as a map keyed by Capability so future slices can flip `sensitive: true` on
// an existing entry without changing the surface of `CAPABILITIES` or the
// `Capability` type. The check service consumes only `isSensitiveCapability`
// so adding sensitive caps doesn't require call-site sweeps.

export const CAPABILITIES = ['workspace.read', 'workspace.admin'] as const;

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
  'workspace.admin': { sensitive: false },
};

export function isCapability(value: string): value is Capability {
  return (CAPABILITIES as readonly string[]).includes(value);
}

export function isSensitiveCapability(cap: Capability): boolean {
  return CAPABILITY_META[cap].sensitive;
}
