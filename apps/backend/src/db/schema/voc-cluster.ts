import { sql } from 'drizzle-orm';
import { check, index, pgSchema, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
    title: text('title').notNull(),
    summary: text('summary'),
    status: text('status').notNull().default('draft'),
    primaryManagedSystemId: uuid('primary_managed_system_id')
      .notNull()
      .references(() => managedSystems.id),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => actors.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    workspaceManagedSystemIdx: index('voc_clusters_workspace_managed_system_idx').on(
      t.workspaceId,
      t.primaryManagedSystemId,
    ),
    statusCheck: check('voc_clusters_status_check', sql`${t.status} in ('draft','confirmed')`),
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
