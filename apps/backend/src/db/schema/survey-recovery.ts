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

export const surveyRecoverySchema = pgSchema('survey');
// Private response and Actor references retain history independently of owner lifecycle.
export const outcomeRecoveryIdentities = surveyRecoverySchema.table(
  'outcome_recovery_identities',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    recoveryItemId: text('outcome_recovery_item_id').notNull(),
    category: text('category').notNull(),
    sourceId: uuid('source_id').notNull(),
    managedSystemId: uuid('managed_system_id'),
    occurrence: integer('occurrence').notNull(),
    state: text('state').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.workspaceId, t.recoveryItemId] }),
    sourceUq: uniqueIndex('outcome_outcome_recovery_identity_source_uq').on(
      t.workspaceId,
      t.category,
      t.sourceId,
    ),
    scopeIdx: index('outcome_outcome_recovery_identity_scope_idx').on(
      t.workspaceId,
      t.managedSystemId,
      t.category,
      t.state,
    ),
    occurrenceCheck: check(
      'outcome_outcome_recovery_identity_occurrence_check',
      sql`${t.occurrence} > 0`,
    ),
    stateCheck: check(
      'outcome_outcome_recovery_identity_state_check',
      sql`${t.state} IN ('active', 'resolved', 'withdrawn')`,
    ),
  }),
);
export const outcomeRecoveryHistory = surveyRecoverySchema.table(
  'outcome_recovery_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    recoveryItemId: text('outcome_recovery_item_id').notNull(),
    occurrence: integer('occurrence').notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }).notNull(),
    outcome: text('outcome').notNull(),
    evidence: text('evidence').notNull(),
    action: text('action'),
    actorId: uuid('actor_id'),
  },
  (t) => ({
    occurrenceUq: uniqueIndex('outcome_outcome_recovery_history_occurrence_uq').on(
      t.workspaceId,
      t.recoveryItemId,
      t.occurrence,
    ),
    windowIdx: index('outcome_outcome_recovery_history_window_idx').on(
      t.workspaceId,
      t.resolvedAt,
      t.id,
    ),
    outcomeCheck: check(
      'outcome_outcome_recovery_history_outcome_check',
      sql`${t.outcome} IN ('resolved', 'withdrawn')`,
    ),
    evidenceCheck: check(
      'outcome_outcome_recovery_history_evidence_check',
      sql`${t.evidence} IN ('command', 'observation') AND (${t.evidence} = 'command' OR (${t.actorId} IS NULL AND ${t.action} IS NULL))`,
    ),
  }),
);
export const outcomeRecoveryPresentations = surveyRecoverySchema.table(
  'outcome_recovery_presentations',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    recoveryItemId: text('outcome_recovery_item_id').notNull(),
    actorId: uuid('actor_id').notNull(),
    occurrence: integer('occurrence').notNull(),
    state: text('state').notNull(),
    snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.workspaceId, t.recoveryItemId, t.actorId, t.occurrence] }),
    actorIdx: index('outcome_outcome_recovery_presentation_actor_idx').on(
      t.workspaceId,
      t.actorId,
      t.recoveryItemId,
    ),
    stateCheck: check(
      'outcome_outcome_recovery_presentation_state_check',
      sql`(${t.state} IN ('visible', 'muted') AND ${t.snoozedUntil} IS NULL) OR (${t.state} = 'snoozed' AND ${t.snoozedUntil} IS NOT NULL)`,
    ),
  }),
);
