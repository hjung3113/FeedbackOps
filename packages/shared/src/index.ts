// Single source of truth for shared API types, zod schemas, and enum constants.
// Apps consume from @fops/shared. Slice 0 is intentionally empty; Slice 1 fills
// in core.Workspace, core.Actor, core.RoleLevel, core.PermissionScope.
export * from './enums/index.js';
export * from './enums/capabilities.js';
export * from './errors/codes.js';
