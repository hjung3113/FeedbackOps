// Drizzle schema for the `permission` namespace.
// Spec sources:
// - CONTEXT.md: Capability, Sensitive Permission, Permission Request.
// - docs/implementation/02-domain-module-boundaries.md: Permission module owns
//   permission_requests, permission_grants, permission_denies.
// - docs/implementation/05-permission-policy.md: explicit deny overrides allow;
//   grants carry workspace_id (required), managed_system_id (optional for
//   Admin, required for Developer scope), object_type/id, sensitive_reason,
//   granted_by/granted_at, expiry, revocation; requests carry source context
//   and lifecycle status.
// - Grill Q5/Q7: column lists locked exactly as encoded below.
// - Grill Q5 followup: the original partial unique predicate referenced
//   `now()` against `expires_at`. now() is not IMMUTABLE so Postgres rejects
//   it inside a partial index predicate. Decision: drop the expires_at
//   condition from the predicate; uniqueness is enforced over non-revoked
//   rows and expiry is enforced at write time in the permission service.

import { sql } from 'drizzle-orm';
import { index, pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const permissionSchema = pgSchema('permission');

// ─────────────────────────────────────────────────────────────────────────
// permission.permission_grants — explicit grant of a Capability to an Actor.
// ─────────────────────────────────────────────────────────────────────────
export const permissionGrants = permissionSchema.table(
  'permission_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    actorId: uuid('actor_id').notNull(),
    capability: text('capability').notNull(),
    managedSystemId: uuid('managed_system_id'),
    objectType: text('object_type'),
    objectId: uuid('object_id'),
    sensitiveReason: text('sensitive_reason'),
    grantedByActorId: uuid('granted_by_actor_id').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedByActorId: uuid('revoked_by_actor_id'),
    revokedReason: text('revoked_reason'),
  },
  (t) => ({
    workspaceActorIdx: index('permission_grants_workspace_actor_idx').on(t.workspaceId, t.actorId),
    workspaceCapabilityIdx: index('permission_grants_workspace_capability_idx').on(
      t.workspaceId,
      t.capability,
    ),
    // Partial unique on the effective scope of a non-revoked grant.
    // Predicate cannot reference now() (not IMMUTABLE) — expiry filtered at
    // write time in the permission service.
    // NOTE: Drizzle 0.38 does not encode COALESCE expressions on partial
    // indexes; this index is replaced/normalised by hand in the generated SQL.
    activeUniq: uniqueIndex('permission_grants_active_uq')
      .on(t.workspaceId, t.actorId, t.capability)
      .where(sql`${t.revokedAt} is null`),
  }),
);

// ─────────────────────────────────────────────────────────────────────────
// permission.permission_denies — explicit deny, overrides any grant.
// ─────────────────────────────────────────────────────────────────────────
export const permissionDenies = permissionSchema.table(
  'permission_denies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    actorId: uuid('actor_id').notNull(),
    capability: text('capability').notNull(),
    managedSystemId: uuid('managed_system_id'),
    reason: text('reason').notNull(),
    createdByActorId: uuid('created_by_actor_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedByActorId: uuid('revoked_by_actor_id'),
  },
  (t) => ({
    workspaceActorIdx: index('permission_denies_workspace_actor_idx').on(t.workspaceId, t.actorId),
    // COALESCE on managed_system_id is added by hand in generated SQL.
    activeUniq: uniqueIndex('permission_denies_active_uq')
      .on(t.workspaceId, t.actorId, t.capability)
      .where(sql`${t.revokedAt} is null`),
  }),
);

// ─────────────────────────────────────────────────────────────────────────
// permission.permission_requests — pending/decided permission asks.
// ─────────────────────────────────────────────────────────────────────────
export const permissionRequests = permissionSchema.table(
  'permission_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    requesterActorId: uuid('requester_actor_id').notNull(),
    requestedCapability: text('requested_capability').notNull(),
    requestedManagedSystemId: uuid('requested_managed_system_id'),
    requestedObjectType: text('requested_object_type'),
    requestedObjectId: uuid('requested_object_id'),
    reason: text('reason').notNull(),
    requestedExpiration: timestamp('requested_expiration', {
      withTimezone: true,
    }),
    sourceObjectType: text('source_object_type'),
    sourceObjectId: uuid('source_object_id'),
    sourceActionId: text('source_action_id'),
    returnRouteIntent: text('return_route_intent'),
    // status: pending | needs_more_info | approved | rejected | expired | revoked
    // (docs/implementation/05-permission-policy.md). Enforced as text + CHECK
    // in hand-edited migration SQL; constraint kept out of Drizzle to avoid
    // duplicating the enum list in two places before the capability vocab
    // file lands in S1.3.
    status: text('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    workspaceRequesterIdx: index('permission_requests_workspace_requester_idx').on(
      t.workspaceId,
      t.requesterActorId,
    ),
    workspaceStatusIdx: index('permission_requests_workspace_status_idx').on(
      t.workspaceId,
      t.status,
    ),
    // Active = pending | needs_more_info; expanded with full COALESCEd scope
    // tuple in hand-edited generated SQL.
    activeUniq: uniqueIndex('permission_requests_active_uq')
      .on(t.workspaceId, t.requesterActorId, t.requestedCapability)
      .where(sql`${t.status} in ('pending','needs_more_info')`),
  }),
);
