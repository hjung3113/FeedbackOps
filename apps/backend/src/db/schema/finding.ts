import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { actors, analyticsAreas, managedSystems, workspaces } from './core.js';

export const findingSchema = pgSchema('finding');

export const findings = findingSchema.table(
  'findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    displayId: text('display_id').notNull(),
    primaryManagedSystemId: uuid('primary_managed_system_id')
      .notNull()
      .references(() => managedSystems.id),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    sourceType: text('source_type').notNull(),
    sourceId: uuid('source_id'),
    evidenceCount: integer('evidence_count').notNull().default(0),
    severity: text('severity').notNull(),
    confidence: text('confidence'),
    status: text('status').notNull().default('draft'),
    analyticsAreaId: uuid('analytics_area_id').references(() => analyticsAreas.id),
    linkedTaskId: uuid('linked_task_id'),
    linkedMilestoneId: uuid('linked_milestone_id'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => actors.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    workspaceDisplayUq: uniqueIndex('findings_workspace_display_id_uq').on(
      t.workspaceId,
      t.displayId,
    ),
    workspaceManagedSystemIdx: index('findings_workspace_managed_system_idx').on(
      t.workspaceId,
      t.primaryManagedSystemId,
    ),
    sourceTypeCheck: check(
      'findings_source_type_check',
      sql`${t.sourceType} in ('voc','voc_cluster','survey','survey_response','manual')`,
    ),
    sourceIdRequiredCheck: check(
      'findings_source_id_required_check',
      sql`${t.sourceType} = 'manual' or ${t.sourceId} is not null`,
    ),
    evidenceCountCheck: check('findings_evidence_count_check', sql`${t.evidenceCount} >= 0`),
    severityCheck: check(
      'findings_severity_check',
      sql`${t.severity} in ('low','medium','high','critical')`,
    ),
    confidenceCheck: check(
      'findings_confidence_check',
      sql`${t.confidence} is null or ${t.confidence} in ('low','medium','high')`,
    ),
    statusCheck: check(
      'findings_status_check',
      sql`${t.status} in ('draft','active','not_actionable','converted','archived')`,
    ),
  }),
);

export const evidenceHighlights = findingSchema.table(
  'evidence_highlights',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    findingId: uuid('finding_id')
      .notNull()
      .references(() => findings.id),
    primaryManagedSystemId: uuid('primary_managed_system_id')
      .notNull()
      .references(() => managedSystems.id),
    sourceType: text('source_type').notNull(),
    sourceId: uuid('source_id'),
    quoteOrSummary: text('quote_or_summary').notNull(),
    analyticsAreaId: uuid('analytics_area_id').references(() => analyticsAreas.id),
    sentiment: text('sentiment'),
    importance: text('importance'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => actors.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    workspaceFindingIdx: index('evidence_highlights_workspace_finding_idx').on(
      t.workspaceId,
      t.findingId,
    ),
    sourceTypeCheck: check(
      'evidence_highlights_source_type_check',
      sql`${t.sourceType} in ('voc','survey_response','note')`,
    ),
    sourceIdRequiredCheck: check(
      'evidence_highlights_source_id_required_check',
      sql`${t.sourceType} = 'note' or ${t.sourceId} is not null`,
    ),
    sentimentCheck: check(
      'evidence_highlights_sentiment_check',
      sql`${t.sentiment} is null or ${t.sentiment} in ('negative','neutral','positive')`,
    ),
    importanceCheck: check(
      'evidence_highlights_importance_check',
      sql`${t.importance} is null or ${t.importance} in ('low','medium','high')`,
    ),
  }),
);
