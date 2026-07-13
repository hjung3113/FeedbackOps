// Drizzle schema for the `core` namespace.
// Spec sources:
// - CONTEXT.md: Workspace, Actor, Role Level vocabulary.
// - docs/implementation/02-domain-module-boundaries.md: Core owns Workspace,
//   Actor, Role Level, Audit Log.
// - docs/implementation/04-database-and-migrations.md: workspace_id present on
//   all domain tables, prefer text/varchar over native enums.
// - ADR-0006: core.sessions shape (opaque text PK, references actors/workspaces).
// - ADR-0008: core.audit_log shape, append-only via role grants.
// - ADR-0015: timestamp/uuid conventions, idempotency_keys composite PK.
//
// No application code reads these tables yet (Slice 1 foundation only).

import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const coreSchema = pgSchema('core');

export const displayCounters = coreSchema.table(
  'display_counters',
  {
    workspaceId: uuid('workspace_id').notNull(),
    entityType: text('entity_type').notNull(),
    nextValue: bigint('next_value', { mode: 'number' }).notNull().default(1000),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.workspaceId, t.entityType] }),
  }),
);

// ─────────────────────────────────────────────────────────────────────────
// core.workspaces — outermost tenant boundary per CONTEXT.md.
// MVP seeds exactly one row (ADR-0006: WORKSPACE_ID env var).
// ─────────────────────────────────────────────────────────────────────────
export const workspaces = coreSchema.table('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────
// core.actors — AD-authenticated internal person bound to a Workspace.
// role_level + actor_type are application-level enums per
// docs/implementation/04-database-and-migrations.md (text with CHECK).
// ─────────────────────────────────────────────────────────────────────────
export const actors = coreSchema.table(
  'actors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    // external_id: provider sub claim (ADR-0006); for seed actors we use a
    // stable handle like 'mock-admin-1' / 'system'.
    externalId: text('external_id').notNull(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    roleLevel: text('role_level').notNull(),
    actorType: text('actor_type').notNull().default('internal_member'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    workspaceIdx: index('actors_workspace_idx').on(t.workspaceId),
    workspaceExternalIdUq: uniqueIndex('actors_workspace_external_id_uq').on(
      t.workspaceId,
      t.externalId,
    ),
    workspaceEmailUq: uniqueIndex('actors_workspace_email_uq').on(t.workspaceId, t.email),
    roleLevelCheck: check(
      'actors_role_level_check',
      sql`${t.roleLevel} in ('admin','developer','user')`,
    ),
    actorTypeCheck: check(
      'actors_actor_type_check',
      sql`${t.actorType} in ('internal_member','system')`,
    ),
  }),
);

// ─────────────────────────────────────────────────────────────────────────
// core.sessions — ADR-0006: opaque text PK, server-side store.
// Cookie name 'fops_session' carries this opaque id.
// ─────────────────────────────────────────────────────────────────────────
export const sessions = coreSchema.table(
  'sessions',
  {
    id: text('id').primaryKey(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actors.id),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdUserAgentSummary: text('created_user_agent_summary'),
    createdIpSummary: text('created_ip_summary'),
  },
  (t) => ({
    workspaceIdx: index('sessions_workspace_idx').on(t.workspaceId),
    workspaceActorIdx: index('sessions_workspace_actor_idx').on(t.workspaceId, t.actorId),
  }),
);

// ─────────────────────────────────────────────────────────────────────────
// core.audit_log — ADR-0008 exact shape, append-only via DB role grants.
// Index conventions per ADR-0015:55-61.
// ─────────────────────────────────────────────────────────────────────────
export const auditLog = coreSchema.table(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // F-003: ADR-0015:55-61 mandates referential integrity on every
    // workspace_id / actor_id. Without the FK an orphaned audit row is
    // unreviewable.
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actors.id),
    eventType: text('event_type').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: uuid('subject_id').notNull(),
    summary: text('summary').notNull(),
    detail: jsonb('detail').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // ADR-0015: every (workspace_id, ...) path starts with workspace_id.
    workspaceCreatedAtIdx: index('audit_log_workspace_created_at_idx').on(
      t.workspaceId,
      t.createdAt.desc(),
    ),
    workspaceSubjectCreatedAtIdx: index('audit_log_workspace_subject_created_at_idx').on(
      t.workspaceId,
      t.subjectType,
      t.subjectId,
      t.createdAt.desc(),
    ),
    workspaceActorCreatedAtIdx: index('audit_log_workspace_actor_created_at_idx').on(
      t.workspaceId,
      t.actorId,
      t.createdAt.desc(),
    ),
    workspaceEventCreatedAtIdx: index('audit_log_workspace_event_created_at_idx').on(
      t.workspaceId,
      t.eventType,
      t.createdAt.desc(),
    ),
  }),
);

// ─────────────────────────────────────────────────────────────────────────
// core.idempotency_keys — ADR-0015:80-87. Composite PK (actor_id, key).
// 24-hour TTL purge runs as a pg-boss job (Slice 1 S1.5, not here).
// ─────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────
// core.rate_limits — ADR-0015:9-14. Backing store for @fastify/rate-limit.
// One row per (key, route_group); counter holds requests in the current
// window, expires_at is the window boundary. Rows are upserted atomically
// per request; an expired row is reset on the next hit.
//
// Not workspace-scoped: rate-limit keys are anon-IP or per-Actor (Actor
// IDs are globally unique within the MVP single-tenant deployment).
// ─────────────────────────────────────────────────────────────────────────
export const rateLimits = coreSchema.table(
  'rate_limits',
  {
    key: text('key').notNull(),
    routeGroup: text('route_group').notNull(),
    counter: integer('counter').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.key, t.routeGroup] }),
    expiresAtIdx: index('rate_limits_expires_at_idx').on(t.expiresAt),
  }),
);

// ─────────────────────────────────────────────────────────────────────────
// core.teams — ADR-0018 placeholder. Slice 2 ships schema + FK target only.
// No CRUD endpoints, no admin UI, no seed rows. Future product slice that
// first needs operator-managed teams adds the management surface without a
// second schema migration.
// ─────────────────────────────────────────────────────────────────────────
export const teams = coreSchema.table(
  'teams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    name: text('name').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedByActorId: uuid('archived_by_actor_id').references(() => actors.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    workspaceIdx: index('teams_workspace_idx').on(t.workspaceId),
    workspaceNameActiveUq: uniqueIndex('teams_workspace_name_active_uq')
      .on(t.workspaceId, t.name)
      .where(sql`${t.archivedAt} is null`),
  }),
);

// ─────────────────────────────────────────────────────────────────────────
// core.managed_systems — ADR-0017. UUID PK + workspace-scoped immutable
// slug + mutable name + optional external_key (metadata only). Archive
// via timestamp + actor; slug reusable after archive via partial unique.
// default_owner XOR-or-both-null CHECK per ADR-0018: at most one of
// (default_owner_actor_id, default_owner_team_id) is non-null.
// ─────────────────────────────────────────────────────────────────────────
export const managedSystems = coreSchema.table(
  'managed_systems',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    externalKey: text('external_key'),
    defaultOwnerActorId: uuid('default_owner_actor_id').references(() => actors.id),
    defaultOwnerTeamId: uuid('default_owner_team_id').references(() => teams.id),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedByActorId: uuid('archived_by_actor_id').references(() => actors.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    workspaceIdx: index('managed_systems_workspace_idx').on(t.workspaceId),
    workspaceSlugActiveUq: uniqueIndex('managed_systems_workspace_slug_active_uq')
      .on(t.workspaceId, t.slug)
      .where(sql`${t.archivedAt} is null`),
    defaultOwnerXorCheck: check(
      'managed_systems_default_owner_xor_check',
      sql`${t.defaultOwnerActorId} is null or ${t.defaultOwnerTeamId} is null`,
    ),
  }),
);

// ─────────────────────────────────────────────────────────────────────────
// core.analytics_areas — ADR-0017. Flat under exactly one Managed System;
// no parent_analytics_area_id per Slice 2 grill Q2. Two MSs may carry the
// same AA slug. Partial unique on (workspace_id, managed_system_id, slug)
// where archived_at IS NULL so slugs are reclaimable after archive.
// ─────────────────────────────────────────────────────────────────────────
export const analyticsAreas = coreSchema.table(
  'analytics_areas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    managedSystemId: uuid('managed_system_id')
      .notNull()
      .references(() => managedSystems.id),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    ownerTeamId: uuid('owner_team_id').references(() => teams.id),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedByActorId: uuid('archived_by_actor_id').references(() => actors.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    workspaceIdx: index('analytics_areas_workspace_idx').on(t.workspaceId),
    workspaceManagedSystemIdx: index('analytics_areas_workspace_managed_system_idx').on(
      t.workspaceId,
      t.managedSystemId,
    ),
    workspaceMsSlugActiveUq: uniqueIndex('analytics_areas_workspace_ms_slug_active_uq')
      .on(t.workspaceId, t.managedSystemId, t.slug)
      .where(sql`${t.archivedAt} is null`),
  }),
);

// ─────────────────────────────────────────────────────────────────────────
// core.entity_links — Slice 4.1 tracer. Canonical polymorphic relationship
// table; registered tuples are enforced by entity_links_tuple_check.
// ─────────────────────────────────────────────────────────────────────────
export const entityLinks = coreSchema.table(
  'entity_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    sourceType: text('source_type').notNull(),
    sourceId: uuid('source_id').notNull(),
    targetType: text('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    relationType: text('relation_type').notNull(),
    visibility: text('visibility').notNull().default('internal_only'),
    status: text('status').notNull().default('active'),
    managedSystemId: uuid('managed_system_id')
      .notNull()
      .references(() => managedSystems.id),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => actors.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
    detachedBy: uuid('detached_by').references(() => actors.id),
    detachReason: text('detach_reason'),
    detachedAt: timestamp('detached_at', { withTimezone: true }),
  },
  (t) => ({
    tupleCheck: check(
      'entity_links_tuple_check',
      sql`(${t.sourceType}, ${t.targetType}, ${t.relationType}) in (('voc','voc','related_to'), ('voc','finding','created_finding'), ('voc','finding','evidence_of'), ('voc_cluster','finding','created_finding'), ('finding','task_request','requested_task'), ('task_request','task','converted_to'), ('finding','task','requested_task'), ('voc','task','evidence_of'), ('voc','task_request','requested_task'), ('voc_cluster','task_request','requested_task'))`,
    ),
    visibilityCheck: check(
      'entity_links_visibility_check',
      sql`${t.visibility} in ('internal_only','summary_visible','visible_to_reporter','admin_only')`,
    ),
    statusCheck: check(
      'entity_links_status_check',
      sql`${t.status} in ('active','stale','detached','revoked')`,
    ),
    notSelfCheck: check(
      'entity_links_not_self_check',
      sql`not (${t.sourceType} = ${t.targetType} and ${t.sourceId} = ${t.targetId})`,
    ),
    activeUniqueIdx: uniqueIndex('entity_links_active_unique_idx')
      .on(t.workspaceId, t.sourceType, t.sourceId, t.targetType, t.targetId, t.relationType)
      .where(sql`${t.status} = 'active'`),
    activeSourceIdx: index('entity_links_active_source_idx')
      .on(t.workspaceId, t.sourceType, t.sourceId)
      .where(sql`${t.status} = 'active'`),
    activeTargetIdx: index('entity_links_active_target_idx')
      .on(t.workspaceId, t.targetType, t.targetId)
      .where(sql`${t.status} = 'active'`),
    workspaceMsStatusIdx: index('entity_links_workspace_ms_status_idx').on(
      t.workspaceId,
      t.managedSystemId,
      t.status,
    ),
    workspaceRelationIdx: index('entity_links_workspace_relation_idx').on(
      t.workspaceId,
      t.relationType,
    ),
  }),
);

export const idempotencyKeys = coreSchema.table(
  'idempotency_keys',
  {
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actors.id),
    key: uuid('key').notNull(),
    requestHash: text('request_hash').notNull(),
    responseStatus: integer('response_status').notNull(),
    responseBody: jsonb('response_body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.actorId, t.key] }),
    createdAtIdx: index('idempotency_keys_created_at_idx').on(t.createdAt),
  }),
);
