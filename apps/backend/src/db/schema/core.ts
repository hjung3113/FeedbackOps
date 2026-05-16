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
    workspaceId: uuid('workspace_id').notNull(),
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
