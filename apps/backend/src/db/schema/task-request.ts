import { sql } from 'drizzle-orm';
import { check, index, pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { actors, managedSystems, workspaces } from './core.js';

export const taskRequestSchema = pgSchema('task_request');

export const taskRequests = taskRequestSchema.table(
  'task_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    displayId: text('display_id'),
    sourceType: text('source_type').notNull(),
    sourceId: uuid('source_id').notNull(),
    primaryManagedSystemId: uuid('primary_managed_system_id')
      .notNull()
      .references(() => managedSystems.id),
    evidenceSummary: text('evidence_summary').notNull(),
    requestedOutcome: text('requested_outcome').notNull(),
    requesterActorId: uuid('requester_actor_id')
      .notNull()
      .references(() => actors.id),
    status: text('status').notNull().default('pending_review'),
    reviewerActorId: uuid('reviewer_actor_id').references(() => actors.id),
    decisionReason: text('decision_reason'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    workspaceDisplayUq: uniqueIndex('task_requests_workspace_display_id_uq').on(
      t.workspaceId,
      t.displayId,
    ),
    workspaceStatusIdx: index('task_requests_workspace_status_idx').on(t.workspaceId, t.status),
    workspaceSourceIdx: index('task_requests_workspace_source_idx').on(
      t.workspaceId,
      t.sourceType,
      t.sourceId,
    ),
    workspaceManagedSystemIdx: index('task_requests_workspace_managed_system_idx').on(
      t.workspaceId,
      t.primaryManagedSystemId,
    ),
    statusCheck: check(
      'task_requests_status_check',
      sql`${t.status} in ('pending_review','approved','rejected','needs_more_evidence','converted')`,
    ),
    sourceTypeCheck: check(
      'task_requests_source_type_check',
      sql`${t.sourceType} in ('finding','voc','voc_cluster')`,
    ),
  }),
);
