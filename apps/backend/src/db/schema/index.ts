// Drizzle schema entry. Slice 1 foundation (issue #2):
// - core: workspaces, actors, sessions, audit_log, idempotency_keys
// - permission: permission_grants, permission_denies, permission_requests
//
// No application code consumes these tables yet — they exist so migrations
// can land and downstream slices (S1.2+) can wire repositories on top.

export * from './core.js';
export * from './permission.js';
export * from './voc.js';
