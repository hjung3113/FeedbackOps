import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { actors, managedSystems, workspaces } from './core.js';
import { vocs } from './voc.js';

export const vocClusterSchema = pgSchema('voc_cluster');

export const vocClusters = vocClusterSchema.table(
  'voc_clusters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    displayId: text('display_id').notNull(),
    title: text('title').notNull(),
    summary: text('summary'),
    severity: text('severity'),
    confidence: text('confidence'),
    rationale: text('rationale'),
    ownerUserId: uuid('owner_user_id').references(() => actors.id),
    status: text('status').notNull().default('draft'),
    primaryManagedSystemId: uuid('primary_managed_system_id')
      .notNull()
      .references(() => managedSystems.id),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => actors.id),
    confirmedBy: uuid('confirmed_by').references(() => actors.id),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    workspaceDisplayUq: uniqueIndex('voc_clusters_workspace_display_id_uq').on(
      t.workspaceId,
      t.displayId,
    ),
    workspaceManagedSystemIdx: index('voc_clusters_workspace_managed_system_idx').on(
      t.workspaceId,
      t.primaryManagedSystemId,
    ),
    statusCheck: check('voc_clusters_status_check', sql`${t.status} in ('draft','confirmed')`),
    severityCheck: check(
      'voc_clusters_severity_check',
      sql`${t.severity} is null or ${t.severity} in ('low','medium','high','critical')`,
    ),
    confidenceCheck: check(
      'voc_clusters_confidence_check',
      sql`${t.confidence} is null or ${t.confidence} in ('low','medium','high')`,
    ),
  }),
);

export const vocClusterMembers = vocClusterSchema.table(
  'voc_cluster_members',
  {
    clusterId: uuid('cluster_id')
      .notNull()
      .references(() => vocClusters.id),
    vocId: uuid('voc_id')
      .notNull()
      .references(() => vocs.id),
    addedBy: uuid('added_by')
      .notNull()
      .references(() => actors.id),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ name: 'voc_cluster_members_pk', columns: [t.clusterId, t.vocId] }),
    vocIdx: index('voc_cluster_members_voc_idx').on(t.vocId),
  }),
);
