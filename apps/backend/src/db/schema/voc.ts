// Drizzle schema for the `voc` namespace — Slice 3 #12 (Task 3).
// 1:1 mirror of migration 0010_slice3_voc_foundation.sql (vocs portion).
//
// Spec sources:
//   docs/implementation/04-database-and-migrations.md §voc tables
//   docs/frontend/specs/voc.md §VOC data model
//   ADR-0011 (rich content as jsonb), ADR-0015 (timestamps/uuid conventions),
//   ADR-0017 (audit detail), ADR-0019 (role grants pattern)
//
// cluster_id is reserved per spec — no FK defined here (cluster service out of
// scope for Slice 3).
//
// Tasks 4–7 will append additional table exports to this file.

import { sql } from 'drizzle-orm';
import {
  check,
  index,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { actors, analyticsAreas, managedSystems, teams, workspaces } from './core.js';

export const vocSchema = pgSchema('voc');

// ─────────────────────────────────────────────────────────────────────────
// voc.vocs — canonical VOC record.
// display_id assigned at INSERT via next_voc_display_id(workspace_id).
// severity / analytics_area_id / owner columns nullable until triage.
// ─────────────────────────────────────────────────────────────────────────
export const vocs = vocSchema.table(
  'vocs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    displayId: text('display_id').notNull(),
    primaryManagedSystemId: uuid('primary_managed_system_id')
      .notNull()
      .references(() => managedSystems.id),
    analyticsAreaId: uuid('analytics_area_id').references(() => analyticsAreas.id),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => actors.id),
    title: text('title').notNull(),
    descriptionRichContent: jsonb('description_rich_content').notNull(),
    severity: text('severity'),
    reporterFacingStatus: text('reporter_facing_status').notNull().default('received'),
    triageState: text('triage_state').notNull().default('untriaged'),
    triageStateReviewPostponedAt: timestamp('triage_state_review_postponed_at', {
      withTimezone: true,
    }),
    ownerUserId: uuid('owner_user_id').references(() => actors.id),
    ownerTeamId: uuid('owner_team_id').references(() => teams.id),
    sourceContext: text('source_context').notNull(),
    // cluster_id reserved per spec; no FK (cluster service out of scope).
    clusterId: uuid('cluster_id'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedByActorId: uuid('archived_by_actor_id').references(() => actors.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    workspaceDisplayUq: uniqueIndex('vocs_workspace_display_id_uq').on(
      t.workspaceId,
      t.displayId,
    ),
    inboxIdx: index('vocs_inbox_idx').on(
      t.workspaceId,
      t.primaryManagedSystemId,
      t.createdAt,
    ),
    myVocsIdx: index('vocs_my_vocs_idx').on(t.workspaceId, t.reporterId, t.createdAt),
    triageQueueIdx: index('vocs_triage_queue_idx')
      .on(t.workspaceId, t.triageState)
      .where(sql`${t.triageState} = 'untriaged'`),
    activeIdx: index('vocs_active_idx')
      .on(t.workspaceId)
      .where(sql`${t.archivedAt} IS NULL`),
    severityEnum: check(
      'vocs_severity_enum',
      sql`${t.severity} IS NULL OR ${t.severity} IN ('low','medium','high','critical')`,
    ),
    reporterFacingStatusEnum: check(
      'vocs_reporter_facing_status_enum',
      sql`${t.reporterFacingStatus} IN ('received','reviewing','assigned','progress','prep','resolved','reopened','closed')`,
    ),
    triageStateEnum: check(
      'vocs_triage_state_enum',
      sql`${t.triageState} IN ('untriaged','triaged','needs_more_information','dismissed_not_actionable')`,
    ),
    sourceContextEnum: check(
      'vocs_source_context_enum',
      sql`${t.sourceContext} IN ('direct_use','proxy_report','operational_discovery','stakeholder_request')`,
    ),
    ownerXor: check(
      'vocs_owner_xor',
      sql`${t.ownerUserId} IS NULL OR ${t.ownerTeamId} IS NULL`,
    ),
  }),
);
