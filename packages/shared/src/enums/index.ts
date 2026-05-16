// Enum constants. Per ADR-0003/0004/0005 and CONTEXT.md Language.
// One canonical string list per enum; both apps import from here.

// Storage form. DB CHECK constraint on core.actors.role_level matches this
// list verbatim (lower-case). All persisted columns, service comparisons,
// and request payloads use these values.
export const ROLE_LEVEL_VALUES = ['admin', 'developer', 'user'] as const;
export type RoleLevel = (typeof ROLE_LEVEL_VALUES)[number];

// Display form. CONTEXT.md prose uses Title-case for the *concept*; UI
// dropdowns and labels render through this map. Never compare against
// these strings — they are not the storage form.
export const ROLE_LEVEL_LABELS: Readonly<Record<RoleLevel, string>> = {
  admin: 'Admin',
  developer: 'Developer',
  user: 'User',
};
