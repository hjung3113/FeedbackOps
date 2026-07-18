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
  bigint,
  boolean,
  check,
  index,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { actors, analyticsAreas, entityLinks, managedSystems, teams, workspaces } from './core.js';
import { tasks } from './task.js';

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
      t.createdAt.desc(),
    ),
    myVocsIdx: index('vocs_my_vocs_idx').on(t.workspaceId, t.reporterId, t.createdAt.desc()),
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

// ─────────────────────────────────────────────────────────────────────────
// voc.voc_public_updates — append-only public status update records.
// fops_app gets SELECT + INSERT only (no UPDATE/DELETE) per ADR-0019.
// ─────────────────────────────────────────────────────────────────────────
export const vocPublicUpdates = vocSchema.table(
  'voc_public_updates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vocId: uuid('voc_id')
      .notNull()
      .references(() => vocs.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actors.id),
    // nullable: skip-path rows carry NULL body (migration 0012).
    bodyRichContent: jsonb('body_rich_content'),
    reporterFacingStatusBefore: text('reporter_facing_status_before').notNull(),
    reporterFacingStatusAfter: text('reporter_facing_status_after').notNull(),
    skipPublicUpdate: boolean('skip_public_update').notNull().default(false),
    skipReason: text('skip_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    vocCreatedIdx: index('voc_public_updates_voc_created_idx').on(t.vocId, t.createdAt),
    statusBeforeEnum: check(
      'voc_public_updates_status_before_enum',
      sql`${t.reporterFacingStatusBefore} IN ('received','reviewing','assigned','progress','prep','resolved','reopened','closed')`,
    ),
    statusAfterEnum: check(
      'voc_public_updates_status_after_enum',
      sql`${t.reporterFacingStatusAfter} IN ('received','reviewing','assigned','progress','prep','resolved','reopened','closed')`,
    ),
    // Migration 0012 + 0013: full skip-row invariants.
    // skip=true  ⇒ body NULL, skip_reason ≥ 8 trimmed, status_before <> status_after
    // skip=false ⇒ body NOT NULL, skip_reason IS NULL
    skipInvariants: check(
      'voc_public_updates_skip_invariants',
      sql`(${t.skipPublicUpdate} = true AND ${t.bodyRichContent} IS NULL AND ${t.skipReason} IS NOT NULL AND length(trim(${t.skipReason})) >= 8 AND ${t.reporterFacingStatusBefore} <> ${t.reporterFacingStatusAfter}) OR (${t.skipPublicUpdate} = false AND ${t.bodyRichContent} IS NOT NULL AND ${t.skipReason} IS NULL)`,
    ),
  }),
);

export const publicUpdateReviewCandidates = vocSchema.table(
  'public_update_review_candidates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
    vocId: uuid('voc_id').notNull().references(() => vocs.id),
    sourceTaskId: uuid('source_task_id').notNull().references(() => tasks.id),
    sourceEntityLinkId: uuid('source_entity_link_id').notNull().references(() => entityLinks.id),
    releaseEventId: uuid('release_event_id').notNull(),
    correlationId: uuid('correlation_id').notNull(),
    triggeredByActorId: uuid('triggered_by_actor_id').notNull().references(() => actors.id),
    status: text('status').notNull().default('pending'),
    resolvedByActorId: uuid('resolved_by_actor_id').references(() => actors.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    dismissalReason: text('dismissal_reason'),
    actionedPublicUpdateId: uuid('actioned_public_update_id').references(() => vocPublicUpdates.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    releaseVocUq: uniqueIndex('public_update_review_candidates_release_voc_uq').on(
      t.workspaceId, t.releaseEventId, t.vocId,
    ),
    pendingTaskVocUq: uniqueIndex('public_update_review_candidates_pending_task_voc_uq')
      .on(t.workspaceId, t.sourceTaskId, t.vocId)
      .where(sql`${t.status} = 'pending'`),
    pendingQueueIdx: index('public_update_review_candidates_pending_queue_idx').on(
      t.workspaceId, t.status, t.createdAt,
    ),
    statusCheck: check(
      'public_update_review_candidates_status_check',
      sql`${t.status} IN ('pending', 'dismissed', 'actioned')`,
    ),
    resolutionCheck: check(
      'public_update_review_candidates_resolution_check',
      sql`(${t.status} = 'pending' AND ${t.resolvedByActorId} IS NULL AND ${t.resolvedAt} IS NULL AND ${t.dismissalReason} IS NULL AND ${t.actionedPublicUpdateId} IS NULL) OR (${t.status} = 'dismissed' AND ${t.resolvedByActorId} IS NOT NULL AND ${t.resolvedAt} IS NOT NULL AND ${t.dismissalReason} IS NOT NULL AND length(trim(${t.dismissalReason})) > 0 AND ${t.actionedPublicUpdateId} IS NULL) OR (${t.status} = 'actioned' AND ${t.resolvedByActorId} IS NOT NULL AND ${t.resolvedAt} IS NOT NULL AND ${t.dismissalReason} IS NULL AND ${t.actionedPublicUpdateId} IS NOT NULL)`,
    ),
  }),
);

// ─────────────────────────────────────────────────────────────────────────
// voc.voc_reporter_replies — append-only replies from the reporter.
// actor_id must equal vocs.reporter_id — enforced by DB trigger.
// fops_app gets SELECT + INSERT only per ADR-0019.
// ─────────────────────────────────────────────────────────────────────────
export const vocReporterReplies = vocSchema.table(
  'voc_reporter_replies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vocId: uuid('voc_id')
      .notNull()
      .references(() => vocs.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actors.id),
    bodyRichContent: jsonb('body_rich_content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    vocCreatedIdx: index('voc_reporter_replies_voc_created_idx').on(t.vocId, t.createdAt),
  }),
);

// ─────────────────────────────────────────────────────────────────────────
// voc.voc_internal_comments — append-only internal staff comments.
// Any authenticated actor in the workspace may insert.
// fops_app gets SELECT + INSERT only per ADR-0019.
// ─────────────────────────────────────────────────────────────────────────
export const vocInternalComments = vocSchema.table(
  'voc_internal_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vocId: uuid('voc_id')
      .notNull()
      .references(() => vocs.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actors.id),
    bodyRichContent: jsonb('body_rich_content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    vocCreatedIdx: index('voc_internal_comments_voc_created_idx').on(t.vocId, t.createdAt),
  }),
);

// ─────────────────────────────────────────────────────────────────────────
// voc.voc_attachments — schema stub; storage upload endpoint deferred.
// Polymorphic reference: exactly one of voc_id / comment_id must be set
// (XOR CHECK). comment_kind discriminates which conversation table holds
// the comment_id; no SQL-level FK on comment_id (spans three tables).
// A BEFORE INSERT trigger (IM-04) asserts comment_id resolves in the named
// table. Archive-over-delete: archived_at / archived_by_actor_id added per
// IM-03 / AGENTS.md; fops_app DELETE revoked.
// ─────────────────────────────────────────────────────────────────────────
export const vocAttachments = vocSchema.table(
  'voc_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vocId: uuid('voc_id').references(() => vocs.id, { onDelete: 'cascade' }),
    commentId: uuid('comment_id'),
    commentKind: text('comment_kind'),
    name: text('name').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    mimeType: text('mime_type').notNull(),
    // Migration 0012 (#22 / C2): renamed from storage_uri; opaque object
    // key shaped `{workspace_id}/{uuidv7}/{sanitized_filename}` per D-03.
    storageKey: text('storage_key').notNull().unique('voc_attachments_storage_key_unique'),
    uploadedByActorId: uuid('uploaded_by_actor_id').notNull().references(() => actors.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // IM-03: archive-over-delete columns (migration 0011).
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedByActorId: uuid('archived_by_actor_id').references(() => actors.id),
    // Migration 0012 (#22 / C2): populated by C3 link step; purge job (C4)
    // reclaims rows where linked_at IS NULL AND created_at < now() - 24h.
    linkedAt: timestamp('linked_at', { withTimezone: true }),
  },
  (t) => ({
    vocIdx: index('voc_attachments_voc_idx').on(t.vocId).where(sql`${t.vocId} IS NOT NULL`),
    commentIdx: index('voc_attachments_comment_idx').on(t.commentId, t.commentKind).where(sql`${t.commentId} IS NOT NULL`),
    // IM-03: active-only partial index for attachment queries (migration 0011).
    activeIdx: index('voc_attachments_active_idx')
      .on(t.vocId)
      .where(sql`${t.archivedAt} IS NULL AND ${t.vocId} IS NOT NULL`),
    // Migration 0012 (#22 / C2): the original 0010 XOR ("exactly one of
    // voc_id / comment_id") was relaxed to "not both" so that C3 can
    // INSERT attachments BEFORE they are linked to a parent. The "exactly
    // one" invariant is now enforced at the service layer (link step).
    subjectNotBoth: check(
      'voc_attachments_subject_not_both',
      sql`not (${t.vocId} is not null and ${t.commentId} is not null)`,
    ),
    commentKindPair: check(
      'voc_attachments_comment_kind_pair',
      sql`(${t.commentId} is null and ${t.commentKind} is null)
        or (${t.commentId} is not null and ${t.commentKind} in ('public_update','reporter_reply','internal_comment'))`,
    ),
  }),
);

// ─────────────────────────────────────────────────────────────────────────
// voc.voc_permission_decisions_seed_fixture — seed-only fixture table.
// NOT a production permission cache. Holds deterministic envelopes for
// two specific VOC fixtures so FE snapshot tests (S3-008) can pin stable
// decision_ids and evaluated_at without re-running the live permission
// service. Production resolves envelopes per request.
// ─────────────────────────────────────────────────────────────────────────
export const vocPermissionDecisionsSeedFixture = vocSchema.table(
  'voc_permission_decisions_seed_fixture',
  {
    vocId: uuid('voc_id').primaryKey().references(() => vocs.id, { onDelete: 'cascade' }),
    envelope: jsonb('envelope').notNull(),
  },
);

// ─────────────────────────────────────────────────────────────────────────
// voc.reporter_facing_status_transitions — seed table for the status
// transition matrix per docs/frontend/specs/voc.md §4.5.
// nextReporterStates(currentStatus, tx) reads this table; service code
// MUST NOT hard-code transitions.
// fops_app gets SELECT only (data is seeded at migration time).
// ─────────────────────────────────────────────────────────────────────────
export const reporterFacingStatusTransitions = vocSchema.table(
  'reporter_facing_status_transitions',
  {
    fromStatus: text('from_status').notNull(),
    toStatus: text('to_status').notNull(),
    allowed: boolean('allowed').notNull(),
    forbiddenReason: text('forbidden_reason'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.fromStatus, t.toStatus] }),
    rfstFromEnum: check(
      'rfst_from_enum',
      sql`${t.fromStatus} IN ('received','reviewing','assigned','progress','prep','resolved','reopened','closed')`,
    ),
    rfstToEnum: check(
      'rfst_to_enum',
      sql`${t.toStatus} IN ('received','reviewing','assigned','progress','prep','resolved','reopened','closed')`,
    ),
    rfstAllowedNoReason: check(
      'rfst_allowed_no_reason',
      sql`${t.allowed} = false OR ${t.forbiddenReason} IS NULL`,
    ),
    rfstDisallowedHasReason: check(
      'rfst_disallowed_has_reason',
      sql`${t.allowed} = true OR (${t.forbiddenReason} IS NOT NULL AND length(trim(${t.forbiddenReason})) > 0)`,
    ),
  }),
);
