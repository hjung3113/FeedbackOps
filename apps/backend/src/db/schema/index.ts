// Drizzle schema entry-point. Re-exports all three schema namespaces:
// - core: workspaces, actors, sessions, audit_log, idempotency_keys,
//         managed_systems, analytics_areas, teams
// - permission: permission_grants, permission_denies, permission_requests
// - voc: vocs, voc_public_updates, voc_reporter_replies,
//        voc_internal_comments, voc_attachments,
//        reporter_facing_status_transitions

export * from './core.js';
export * from './permission.js';
export * from './voc.js';
