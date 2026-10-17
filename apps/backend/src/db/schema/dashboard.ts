import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { workspaces } from './core.js';

export const dashboardSchema = pgSchema('dashboard');
// Owner IDs are durable logical references: source/Actor/System deletion must not erase history.
export const recoveryIdentities = dashboardSchema.table(
  'recovery_identities',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    recoveryItemId: text('recovery_item_id').notNull(),
    category: text('category').notNull(),
    sourceId: uuid('source_id').notNull(),
    managedSystemId: uuid('managed_system_id'),
    occurrence: integer('occurrence').notNull(),
    state: text('state').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.workspaceId, t.recoveryItemId] }),
    sourceUq: uniqueIndex('recovery_identity_source_uq').on(t.workspaceId, t.category, t.sourceId),
    scopeIdx: index('recovery_identity_scope_idx').on(
      t.workspaceId,
      t.managedSystemId,
      t.category,
      t.state,
    ),
    occurrenceCheck: check('recovery_identity_occurrence_check', sql`${t.occurrence} > 0`),
    stateCheck: check(
      'recovery_identity_state_check',
      sql`${t.state} IN ('active', 'resolved', 'withdrawn')`,
    ),
  }),
);
export const recoveryHistory = dashboardSchema.table(
  'recovery_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    recoveryItemId: text('recovery_item_id').notNull(),
    occurrence: integer('occurrence').notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }).notNull(),
    outcome: text('outcome').notNull(),
    evidence: text('evidence').notNull(),
    action: text('action'),
    actorId: uuid('actor_id'),
  },
  (t) => ({
    occurrenceUq: uniqueIndex('recovery_history_occurrence_uq').on(
      t.workspaceId,
      t.recoveryItemId,
      t.occurrence,
    ),
    windowIdx: index('recovery_history_window_idx').on(t.workspaceId, t.resolvedAt, t.id),
    outcomeCheck: check(
      'recovery_history_outcome_check',
      sql`${t.outcome} IN ('resolved', 'withdrawn')`,
    ),
    evidenceCheck: check(
      'recovery_history_evidence_check',
      sql`${t.evidence} IN ('command', 'observation') AND (${t.evidence} = 'command' OR (${t.actorId} IS NULL AND ${t.action} IS NULL))`,
    ),
  }),
);
export const recoveryPresentations = dashboardSchema.table(
  'recovery_presentations',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    recoveryItemId: text('recovery_item_id').notNull(),
    actorId: uuid('actor_id').notNull(),
    occurrence: integer('occurrence').notNull(),
    state: text('state').notNull(),
    snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.workspaceId, t.recoveryItemId, t.actorId, t.occurrence] }),
    actorIdx: index('recovery_presentation_actor_idx').on(
      t.workspaceId,
      t.actorId,
      t.recoveryItemId,
    ),
    stateCheck: check(
      'recovery_presentation_state_check',
      sql`(${t.state} IN ('visible', 'muted') AND ${t.snoozedUntil} IS NULL) OR (${t.state} = 'snoozed' AND ${t.snoozedUntil} IS NOT NULL)`,
    ),
  }),
);
