// apps/backend/src/modules/voc/repo.ts
// Slim repo layer for the VOC module. Owns reads/writes on voc.vocs only —
// other voc.* tables stay behind their own repos. Mirrors the AA module
// shape so callers can be reviewed against the same template.

import { sql } from 'drizzle-orm';

import { analyticsAreas, managedSystems } from '../../db/schema/core.js';
import { vocInternalComments, vocPublicUpdates, vocReporterReplies, vocs } from '../../db/schema/voc.js';
import type { Tx } from '../../db/tx.js';
import type { ReporterFacingStatus } from './transitions.js';

export interface LockedManagedSystem {
  id: string;
  workspace_id: string;
  archived_at: Date | null;
}

export interface LockedAnalyticsArea {
  id: string;
  workspace_id: string;
  managed_system_id: string;
  archived_at: Date | null;
}

export async function lockManagedSystem(
  tx: Tx,
  workspaceId: string,
  managedSystemId: string,
): Promise<LockedManagedSystem | null> {
  const rows = await tx.execute<{
    id: string;
    workspace_id: string;
    archived_at: Date | null;
  }>(sql`
    select id, workspace_id, archived_at
    from ${managedSystems}
    where id = ${managedSystemId}
      and workspace_id = ${workspaceId}
    for update
  `);
  const row = rows.rows[0];
  return row
    ? { id: row.id, workspace_id: row.workspace_id, archived_at: row.archived_at }
    : null;
}

export async function lockAnalyticsArea(
  tx: Tx,
  workspaceId: string,
  analyticsAreaId: string,
): Promise<LockedAnalyticsArea | null> {
  const rows = await tx.execute<{
    id: string;
    workspace_id: string;
    managed_system_id: string;
    archived_at: Date | null;
  }>(sql`
    select id, workspace_id, managed_system_id, archived_at
    from ${analyticsAreas}
    where id = ${analyticsAreaId}
      and workspace_id = ${workspaceId}
    for update
  `);
  const row = rows.rows[0];
  return row
    ? {
        id: row.id,
        workspace_id: row.workspace_id,
        managed_system_id: row.managed_system_id,
        archived_at: row.archived_at,
      }
    : null;
}

// ── selectVocForUpdate ─────────────────────────────────────────────────────
// Acquires a FOR UPDATE row lock on voc.vocs for the PATCH triage flow.
// Returns null when no matching row exists (caller throws not_found).
// Mirrors lockManagedSystem / lockAnalyticsArea style.

export interface LockedVoc {
  id: string;
  workspaceId: string;
  primaryManagedSystemId: string;
  analyticsAreaId: string | null;
  reporterId: string;
  displayId: string;
  title: string;
  descriptionRichContent: unknown;
  severity: 'low' | 'medium' | 'high' | 'critical' | null;
  reporterFacingStatus: string;
  triageState: 'untriaged' | 'triaged' | 'needs_more_information' | 'dismissed_not_actionable';
  triageStateReviewPostponedAt: Date | null;
  ownerUserId: string | null;
  ownerTeamId: string | null;
  sourceContext: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function selectVocForUpdate(
  tx: Tx,
  workspaceId: string,
  vocId: string,
): Promise<LockedVoc | null> {
  const rows = await tx.execute<{
    id: string;
    workspace_id: string;
    primary_managed_system_id: string;
    analytics_area_id: string | null;
    reporter_id: string;
    display_id: string;
    title: string;
    description_rich_content: unknown;
    severity: string | null;
    reporter_facing_status: string;
    triage_state: string;
    triage_state_review_postponed_at: Date | string | null;
    owner_user_id: string | null;
    owner_team_id: string | null;
    source_context: string;
    archived_at: Date | string | null;
    created_at: Date | string;
    updated_at: Date | string;
  }>(sql`
    select
      id, workspace_id, primary_managed_system_id, analytics_area_id, reporter_id,
      display_id, title, description_rich_content, severity, reporter_facing_status,
      triage_state, triage_state_review_postponed_at,
      owner_user_id, owner_team_id, source_context,
      archived_at, created_at, updated_at
    from ${vocs}
    where id = ${vocId}
      and workspace_id = ${workspaceId}
    for update
  `);
  const row = rows.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    primaryManagedSystemId: row.primary_managed_system_id,
    analyticsAreaId: row.analytics_area_id,
    reporterId: row.reporter_id,
    displayId: row.display_id,
    title: row.title,
    descriptionRichContent: row.description_rich_content,
    severity: row.severity as LockedVoc['severity'],
    reporterFacingStatus: row.reporter_facing_status,
    triageState: row.triage_state as LockedVoc['triageState'],
    triageStateReviewPostponedAt: toDateOrNull(row.triage_state_review_postponed_at),
    ownerUserId: row.owner_user_id,
    ownerTeamId: row.owner_team_id,
    sourceContext: row.source_context,
    archivedAt: toDateOrNull(row.archived_at),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

// node-pg returns timestamptz as a Date by default, but drizzle `tx.execute`
// raw rows may surface ISO strings depending on type-parser registration.
// Normalise to Date so callers can call `.toISOString()` without guarding.
function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}
function toDateOrNull(v: Date | string | null): Date | null {
  if (v === null) return null;
  return v instanceof Date ? v : new Date(v);
}

export interface InsertVocInput {
  workspaceId: string;
  primaryManagedSystemId: string;
  analyticsAreaId: string | null;
  reporterId: string;
  title: string;
  descriptionRichContent: unknown;
  sourceContext: string;
}

// ── insertPublicUpdate ─────────────────────────────────────────────────────
// Appends one row to voc.voc_public_updates. DB CHECK (C1 migration 0012)
// enforces the skip-invariants so callers do not need to duplicate them.

export async function insertPublicUpdate(
  tx: Tx,
  args: {
    vocId: string;
    actorId: string;
    body: unknown | null;
    statusBefore: ReporterFacingStatus;
    statusAfter: ReporterFacingStatus;
    skip: boolean;
    skipReason: string | null;
  },
): Promise<{ id: string; created_at: Date }> {
  const rows = await tx
    .insert(vocPublicUpdates)
    .values({
      vocId: args.vocId,
      actorId: args.actorId,
      bodyRichContent: args.body as object | null,
      reporterFacingStatusBefore: args.statusBefore,
      reporterFacingStatusAfter: args.statusAfter,
      skipPublicUpdate: args.skip,
      skipReason: args.skipReason,
    })
    .returning({ id: vocPublicUpdates.id, createdAt: vocPublicUpdates.createdAt });
  const row = rows[0];
  if (!row) throw new Error('insertPublicUpdate returned no row');
  return { id: row.id, created_at: row.createdAt };
}

// ── insertReporterReply ────────────────────────────────────────────────────
// Appends one row to voc.voc_reporter_replies. The DB BEFORE INSERT trigger
// `enforce_reporter_reply_actor` (migration 0010) is defense-in-depth; the
// service layer must already have verified actor === reporter.

export async function insertReporterReply(
  tx: Tx,
  args: {
    vocId: string;
    actorId: string;
    body: unknown;
  },
): Promise<{ id: string; created_at: Date }> {
  const rows = await tx
    .insert(vocReporterReplies)
    .values({
      vocId: args.vocId,
      actorId: args.actorId,
      bodyRichContent: args.body as object,
    })
    .returning({ id: vocReporterReplies.id, createdAt: vocReporterReplies.createdAt });
  const row = rows[0];
  if (!row) throw new Error('insertReporterReply returned no row');
  return { id: row.id, created_at: row.createdAt };
}

// ── insertInternalComment ──────────────────────────────────────────────────
// Appends one row to voc.voc_internal_comments.

export async function insertInternalComment(
  tx: Tx,
  args: {
    vocId: string;
    actorId: string;
    body: unknown;
  },
): Promise<{ id: string; created_at: Date }> {
  const rows = await tx
    .insert(vocInternalComments)
    .values({
      vocId: args.vocId,
      actorId: args.actorId,
      bodyRichContent: args.body as object,
    })
    .returning({ id: vocInternalComments.id, createdAt: vocInternalComments.createdAt });
  const row = rows[0];
  if (!row) throw new Error('insertInternalComment returned no row');
  return { id: row.id, created_at: row.createdAt };
}

// ── updateVocReporterStatus ────────────────────────────────────────────────
// Bumps reporter_facing_status and updated_at on voc.vocs.
// No workspace filter — caller must have already locked the row via
// selectVocForUpdate within the same transaction.

export async function updateVocReporterStatus(
  tx: Tx,
  args: {
    vocId: string;
    nextStatus: ReporterFacingStatus;
  },
): Promise<void> {
  await tx.execute(sql`
    UPDATE ${vocs}
    SET reporter_facing_status = ${args.nextStatus},
        updated_at = now()
    WHERE id = ${args.vocId}
  `);
}

export async function insertVoc(tx: Tx, input: InsertVocInput) {
  // next_voc_display_id is a SECURITY DEFINER function from migration 0010
  // (#12). It assigns the next VOC-#### slug for the workspace under an
  // advisory lock; we obtain it before the INSERT to keep the SQL surface
  // small (one round trip is fine in a transaction).
  const displayRows = await tx.execute<{ next_voc_display_id: string }>(sql`
    select voc.next_voc_display_id(${input.workspaceId}) as next_voc_display_id
  `);
  const displayId = displayRows.rows[0]?.next_voc_display_id;
  if (!displayId) {
    throw new Error('next_voc_display_id returned empty');
  }

  const inserted = await tx
    .insert(vocs)
    .values({
      workspaceId: input.workspaceId,
      displayId,
      primaryManagedSystemId: input.primaryManagedSystemId,
      analyticsAreaId: input.analyticsAreaId,
      reporterId: input.reporterId,
      title: input.title,
      descriptionRichContent: input.descriptionRichContent as object,
      sourceContext: input.sourceContext,
      // defaults handle: severity=null, reporterFacingStatus='received',
      // triageState='untriaged', ownerUserId=null, ownerTeamId=null
    })
    .returning();
  return inserted[0];
}
