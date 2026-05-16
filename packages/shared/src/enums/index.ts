// Enum constants. Per ADR-0003/0004/0005 and CONTEXT.md Language.
// One canonical string list per enum; both apps import from here.

export const ROLE_LEVELS = ['Admin', 'Developer', 'User'] as const;
export type RoleLevel = (typeof ROLE_LEVELS)[number];
